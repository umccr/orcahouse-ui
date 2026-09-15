'use client';

import { useEffect, useState } from 'react';
import { Check, Clipboard, KeyRound, LoaderCircle, ShieldAlert } from 'lucide-react';
import { useNow } from '@/hooks/useNow';
import { getIdToken } from '@/lib/auth';
import { Dialog } from './Dialog';
import { ErrorNotice } from './ErrorNotice';
import { BUTTON_PRIMARY } from './ui';

type TokenState =
  | { status: 'loading' }
  | { status: 'ready'; token: string; expiresAt: Date | null }
  | { status: 'error'; message: string };

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Shows a freshly refreshed ID token, for GraphiQL or scripts that call the mart API. */
export function TokenDialog({ open, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title='JSON Web Token (JWT)'
      description='Your Cognito ID token for the mart API'
      icon={<KeyRound className='h-4 w-4' aria-hidden='true' />}
      size='lg'
    >
      <TokenDetails />
    </Dialog>
  );
}

function TokenDetails() {
  const [state, setState] = useState<TokenState>({ status: 'loading' });
  const [copied, setCopied] = useState(false);
  const now = useNow(30_000);

  useEffect(() => {
    let cancelled = false;
    // Force a refresh so the copied token has its full lifetime ahead of it.
    getIdToken({ forceRefresh: true })
      .then((token) => {
        if (cancelled) return;
        if (!token) {
          setState({ status: 'error', message: 'No ID token in the current session.' });
          return;
        }
        const { exp } = token.payload;
        setState({
          status: 'ready',
          token: token.toString(),
          expiresAt: typeof exp === 'number' ? new Date(exp * 1000) : null,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (state.status === 'loading') {
    return (
      <p className='text-muted dark:text-muted-dark flex h-40 items-center justify-center gap-2 text-sm'>
        <LoaderCircle className='h-4 w-4 animate-spin' aria-hidden='true' />
        Fetching a fresh token…
      </p>
    );
  }

  if (state.status === 'error') {
    return <ErrorNotice title='Could not fetch the token' message={state.message} />;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const minutesLeft =
    state.expiresAt && now !== null
      ? Math.max(0, Math.round((state.expiresAt.getTime() - now) / 60_000))
      : null;

  return (
    <div className='space-y-5'>
      <div className='flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-50/60 p-4 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-900/20 dark:text-amber-200'>
        <ShieldAlert className='mt-0.5 h-5 w-5 shrink-0' aria-hidden='true' />
        <div>
          <p className='font-medium'>Security notice</p>
          <p className='mt-1'>This token acts as you. Do not share it or commit it anywhere.</p>
        </div>
      </div>

      <div className='space-y-1.5'>
        <p className='text-sm font-medium'>Expires</p>
        <p className='border-line bg-canvas dark:border-line-dark dark:bg-raised-dark rounded-md border px-3 py-2 text-sm'>
          {state.expiresAt
            ? state.expiresAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : 'Unknown'}
          {minutesLeft !== null && (
            <span className='text-muted dark:text-muted-dark'> · in {minutesLeft} min</span>
          )}
        </p>
      </div>

      <div className='space-y-1.5'>
        <p className='text-sm font-medium'>Token</p>
        <div className='border-line bg-canvas dark:border-line-dark dark:bg-raised-dark max-h-28 overflow-y-auto rounded-md border px-3 py-2'>
          <code className='font-mono text-xs break-all'>{state.token}</code>
        </div>
      </div>

      <div className='flex justify-end'>
        <button type='button' onClick={() => void copy()} className={BUTTON_PRIMARY}>
          {copied ? (
            <Check className='h-4 w-4' aria-hidden='true' />
          ) : (
            <Clipboard className='h-4 w-4' aria-hidden='true' />
          )}
          {copied ? 'Copied' : 'Copy token'}
        </button>
      </div>
    </div>
  );
}
