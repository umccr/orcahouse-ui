import { HttpLink } from '@apollo/client';
import { ApolloClient, InMemoryCache } from '@apollo/client-integration-nextjs';
import { getIdToken } from './auth';
import { martApiUrl } from './environment';

/**
 * Apollo Client factory used by ApolloNextAppProvider.
 *
 * Deployed under portal.umccr.org/orcahouse/, the browser calls the mart API directly: its CORS
 * policy allows the portal origins. On localhost it does not, so development goes through the
 * same-origin proxy in src/app/api/graphql/route.dev.ts. The signed-in user's Cognito ID token is
 * attached here, refreshed by Amplify when it has expired.
 */

/**
 * The endpoint is resolved per request rather than once at module load, for two reasons: the
 * deployed host comes from `window.location.hostname`, which does not exist while `next build`
 * prerenders this module, and no request is made during prerendering anyway because AuthGate
 * resolves the session in the browser.
 */
function graphqlUri(): string {
  if (process.env.NODE_ENV === 'development') {
    return `${process.env.NEXT_PUBLIC_BASE_PATH}/api/graphql/`;
  }
  return `${martApiUrl(window.location.hostname)}/graphql`;
}

const fetchWithToken: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  const token = await getIdToken();
  if (token) headers.set('authorization', `Bearer ${token.toString()}`);
  return fetch(input, { ...init, headers });
};

export function makeClient() {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({ uri: () => graphqlUri(), fetch: fetchWithToken }),
  });
}
