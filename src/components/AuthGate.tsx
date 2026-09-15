'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { LoaderCircle } from 'lucide-react';
import {
  configureAuth,
  loadUser,
  takeRedirectError,
  takeReturnPath,
  type AuthUser,
} from '@/lib/auth';
import { SignInPage } from './SignInPage';

type AuthState =
  | { status: 'loading' }
  | { status: 'notConfigured' }
  | { status: 'signedOut'; error?: string }
  | { status: 'signedIn'; user: AuthUser };

interface AuthContextValue {
  user: AuthUser;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthGate>');
  return context;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Resolves the Cognito session in the browser and renders the app only for a signed-in
 * user. Anyone else sees the sign-in page at the URL they opened, and returns to it after
 * the hosted UI redirect.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  // The settings are only known in the browser, so the static HTML always starts here.
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    let stopListening = () => {};

    const check = () =>
      loadUser().then(
        (user) => {
          if (!user) {
            // A failed redirect may have settled before this component mounted. Without a
            // newer error, keep the one already on screen.
            const error = takeRedirectError() ?? undefined;
            setState((prev) =>
              prev.status === 'signedOut' && !error ? prev : { status: 'signedOut', error }
            );
            return;
          }
          setState({ status: 'signedIn', user });
          const returnPath = takeReturnPath();
          if (returnPath) router.replace(returnPath);
        },
        (error: unknown) => setState({ status: 'signedOut', error: messageOf(error) })
      );

    void configureAuth().then((configured) => {
      if (!active) return;
      if (!configured) {
        setState({ status: 'notConfigured' });
        return;
      }
      stopListening = Hub.listen('auth', ({ payload }) => {
        switch (payload.event) {
          case 'signInWithRedirect':
            void check();
            break;
          case 'signInWithRedirect_failure':
            // lib/auth's listener runs first and holds the message.
            setState({
              status: 'signedOut',
              error: takeRedirectError() ?? 'Sign-in did not complete.',
            });
            break;
          case 'tokenRefresh_failure':
          case 'signedOut':
            setState({ status: 'signedOut' });
            break;
        }
      });
      void check();
    });

    return () => {
      active = false;
      stopListening();
    };
  }, [router]);

  const handleSignOut = useCallback(async () => {
    try {
      // Clears the local tokens, then redirects through the Cognito logout endpoint.
      await signOut();
    } catch (error) {
      console.error('Sign-out failed:', error);
    } finally {
      setState({ status: 'signedOut' });
    }
  }, []);

  const user = state.status === 'signedIn' ? state.user : null;
  const value = useMemo(
    () => (user ? { user, signOut: handleSignOut } : null),
    [user, handleSignOut]
  );

  if (state.status === 'loading') {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <title>OrcaHouse</title>
        <p className='text-muted dark:text-muted-dark flex items-center gap-2 text-sm'>
          <LoaderCircle className='h-4 w-4 animate-spin' aria-hidden='true' />
          Checking sign-in…
        </p>
      </div>
    );
  }

  if (!value) {
    return (
      <>
        <title>OrcaHouse</title>
        <SignInPage
          configured={state.status !== 'notConfigured'}
          error={state.status === 'signedOut' ? state.error : undefined}
        />
      </>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
