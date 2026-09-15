import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signInWithRedirect, type JWT } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

/**
 * Cognito sign-in through the hosted UI with Google federation, as in the OrcaBus portal.
 *
 * Deployed under portal.umccr.org/mart/, the settings come from the portal's runtime config
 * (/env.js sets window.config, as for orca-ui-v2), so the app uses the portal's app client
 * and shares its session. In development they come from the NEXT_PUBLIC_* variables that
 * start.sh exports. Amplify runs in the browser only and refreshes the tokens on demand; the
 * ID token is what the mart API's JWT authorizer validates.
 */

declare global {
  interface Window {
    /** The portal's runtime config, set by /env.js. */
    config?: Record<string, string | undefined>;
  }
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const RETURN_PATH_KEY = 'orcahouse-ui.return-path';
const OAUTH_PARAMS = ['code', 'state', 'error', 'error_description'];

// Captured before Amplify completes the OAuth redirect and rewrites the callback URL.
let returnPending =
  typeof window !== 'undefined' &&
  ['code', 'state'].every((key) => new URLSearchParams(window.location.search).has(key));

let redirectError: string | null = null;

/** The portal's window.config, loading /env.js if it has not run yet. Empty in development. */
function loadRuntimeConfig(): Promise<Record<string, string | undefined>> {
  if (process.env.NODE_ENV === 'development') return Promise.resolve({});
  if (window.config) return Promise.resolve(window.config);
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = '/env.js';
    script.onload = () => resolve(window.config ?? {});
    script.onerror = () => resolve({});
    document.head.append(script);
  });
}

let configured: Promise<boolean> | null = null;

/**
 * Configures Amplify once, from the portal's runtime config or else the build environment.
 * Resolves to false when neither has the Cognito settings.
 */
export function configureAuth(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  configured ??= loadRuntimeConfig().then((runtime) => {
    const settings = runtime.VITE_COG_USER_POOL_ID
      ? {
          region: runtime.VITE_REGION,
          userPoolId: runtime.VITE_COG_USER_POOL_ID,
          userPoolClientId: runtime.VITE_COG_APP_CLIENT_ID,
          oauthDomain: runtime.VITE_OAUTH_DOMAIN,
          redirectSignIn: runtime.VITE_OAUTH_REDIRECT_IN,
          redirectSignOut: runtime.VITE_OAUTH_REDIRECT_OUT,
        }
      : {
          region: process.env.NEXT_PUBLIC_COGNITO_REGION,
          userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
          userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID,
          oauthDomain: process.env.NEXT_PUBLIC_COGNITO_OAUTH_DOMAIN,
          redirectSignIn: process.env.NEXT_PUBLIC_OAUTH_REDIRECT_SIGN_IN,
          redirectSignOut: process.env.NEXT_PUBLIC_OAUTH_REDIRECT_SIGN_OUT,
        };
    const { userPoolId, userPoolClientId, oauthDomain } = settings;
    if (!userPoolId || !userPoolClientId || !oauthDomain) return false;

    // Listen before configure() starts completing a redirect: a failure can settle before
    // React has mounted anything to hear it.
    Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect_failure') {
        redirectError = payload.data.error?.message ?? 'Sign-in did not complete.';
      }
    });

    const origin = window.location.origin;
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId,
          userPoolClientId,
          loginWith: {
            oauth: {
              // SSM stores the hosted UI domain prefix; a full host name works too.
              domain: oauthDomain.includes('.')
                ? oauthDomain
                : `${oauthDomain}.auth.${settings.region || 'ap-southeast-2'}.amazoncognito.com`,
              scopes: ['openid', 'email', 'profile'],
              // Each URL must be registered on the Cognito app client.
              redirectSignIn: [settings.redirectSignIn || origin],
              redirectSignOut: [settings.redirectSignOut || origin],
              responseType: 'code',
            },
          },
        },
      },
    });
    return true;
  });
  return configured;
}

export interface LinkedIdentity {
  providerName: string;
  providerType: string | null;
  userId: string | null;
  issuer: string | null;
  primary: boolean;
  dateCreated: Date | null;
}

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
  groups: string[];
  identities: LinkedIdentity[];
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** "ray.liu@umccr.org" becomes "Ray Liu". */
function nameFromEmail(email: string): string {
  return (email.split('@')[0] ?? '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Cognito adds federated users to a group such as "ap-southeast-2_AbCdEf123_Google".
const IDP_GROUP = /^[a-z]+-[a-z]+-\d+_[A-Za-z0-9]+_(\w+)$/;

function parseIdentities(raw: unknown): LinkedIdentity[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const created = Number(item.dateCreated);
      return {
        providerName: text(item.providerName) || text(item.providerType) || 'Unknown',
        providerType: text(item.providerType) || null,
        userId: text(item.userId) || null,
        issuer: text(item.issuer) || null,
        primary: String(item.primary) === 'true',
        dateCreated: Number.isFinite(created) && created > 0 ? new Date(created) : null,
      };
    });
}

function userFromIdToken(token: JWT): AuthUser {
  const { payload } = token;
  const email = text(payload.email);
  const fullName = [text(payload.given_name), text(payload.family_name)].filter(Boolean).join(' ');
  const groups = Array.isArray(payload['cognito:groups']) ? payload['cognito:groups'] : [];
  return {
    sub: text(payload.sub),
    email,
    name: text(payload.name) || fullName || nameFromEmail(email) || 'Signed-in user',
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    groups: groups.map(text).map((group) => {
      const match = IDP_GROUP.exec(group);
      return match ? `${match[1]} (default)` : group;
    }),
    identities: parseIdentities(payload.identities),
  };
}

/**
 * The current ID token, refreshed by Amplify when it has expired, or null when signed out.
 * While an OAuth redirect is still being completed, this waits for it to finish.
 */
export async function getIdToken(options?: { forceRefresh?: boolean }): Promise<JWT | null> {
  if (!(await configureAuth())) return null;
  const { tokens } = await fetchAuthSession(options);
  return tokens?.idToken ?? null;
}

export async function loadUser(): Promise<AuthUser | null> {
  const token = await getIdToken();
  return token ? userFromIdToken(token) : null;
}

/** Sends the browser to the Cognito hosted UI, remembering the page to come back to. */
export async function signIn(): Promise<void> {
  const url = new URL(window.location.href);
  OAUTH_PARAMS.forEach((key) => url.searchParams.delete(key));
  // Kept relative to the base path, which is how the Next.js router takes it back.
  const path = url.pathname.startsWith(BASE_PATH)
    ? url.pathname.slice(BASE_PATH.length) || '/'
    : url.pathname;
  try {
    window.sessionStorage.setItem(RETURN_PATH_KEY, `${path}${url.search}${url.hash}`);
  } catch {
    // Storage unavailable: the user lands on the default page instead.
  }
  await signInWithRedirect({ provider: 'Google' });
}

/**
 * On the first call after an OAuth redirect, the in-app path the sign-in started from.
 * Null otherwise, so ordinary page loads never navigate.
 */
export function takeReturnPath(): string | null {
  if (!returnPending) return null;
  returnPending = false;
  let path: string | null = null;
  try {
    path = window.sessionStorage.getItem(RETURN_PATH_KEY);
    window.sessionStorage.removeItem(RETURN_PATH_KEY);
  } catch {
    // Fall through to the default page.
  }
  return path?.startsWith('/') && !path.startsWith('//') ? path : '/';
}

/** The error from a failed OAuth redirect on this page load, reported once. */
export function takeRedirectError(): string | null {
  const error = redirectError;
  redirectError = null;
  return error;
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}
