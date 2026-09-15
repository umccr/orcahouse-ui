'use client';

import Image from 'next/image';
import { useState } from 'react';
import { LoaderCircle, UserIcon, Warehouse } from 'lucide-react';
import { signIn } from '@/lib/auth';

const NOT_CONFIGURED =
  process.env.NODE_ENV === 'development'
    ? 'Sign-in is not configured. Start the dev server with `make start`, which reads the Cognito settings from SSM (see start.sh).'
    : "Sign-in is not configured: the portal's runtime config (/env.js) did not load.";

/** Full-screen sign-in, styled after the OrcaBus portal's. Always dark. */
export function SignInPage({ configured, error }: { configured: boolean; error?: string }) {
  const [redirecting, setRedirecting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const message = configured ? (failure ?? error) : NOT_CONFIGURED;

  const start = async () => {
    setRedirecting(true);
    setFailure(null);
    try {
      // Resolves as the browser leaves for the hosted UI, so keep the spinner.
      await signIn();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Sign-in failed.');
      setRedirecting(false);
    }
  };

  return (
    <div className='relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 [color-scheme:dark]'>
      <div
        aria-hidden='true'
        className='absolute inset-0'
        style={{
          backgroundImage: [
            'radial-gradient(ellipse 80% 60% at 20% 100%, rgba(15, 80, 160, 0.35), transparent)',
            'radial-gradient(ellipse 60% 50% at 80% 0%, rgba(6, 40, 100, 0.4), transparent)',
            'radial-gradient(ellipse 40% 40% at 50% 50%, rgba(30, 60, 120, 0.15), transparent)',
          ].join(', '),
        }}
      />
      <div
        aria-hidden='true'
        className='absolute inset-0 opacity-[0.03]'
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 30h60M30 0v60' stroke='%23fff' stroke-width='.5' fill='none'/%3E%3C/svg%3E\")",
        }}
      />

      <div className='relative z-10 mx-auto w-full max-w-md px-6 py-10'>
        <div className='mb-8 flex flex-col items-center gap-4'>
          <div className='bg-signal shadow-signal/30 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg'>
            <Warehouse className='h-7 w-7 text-white' aria-hidden='true' />
          </div>
          <div className='text-center'>
            <h1 className='text-2xl font-bold tracking-tight text-white'>OrcaHouse</h1>
            <p className='mt-1 text-xs font-medium tracking-widest text-slate-400 uppercase'>
              UMCCR Data Warehouse
            </p>
          </div>
        </div>

        <div className='rounded-xl border border-slate-800/60 bg-slate-900/70 shadow-2xl shadow-black/40 backdrop-blur-xl'>
          <div className='space-y-6 p-8'>
            <div className='space-y-2 text-center'>
              <h2 className='text-lg font-semibold text-white'>Welcome back</h2>
              <p className='text-sm leading-relaxed text-slate-400'>
                Sign in with your institutional UMCCR account to access the data warehouse.
              </p>
            </div>

            {message && (
              <p
                role='alert'
                className='rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs break-words text-red-200'
              >
                {message}
              </p>
            )}

            <button
              type='button'
              onClick={() => void start()}
              disabled={redirecting || !configured}
              className='flex w-full cursor-pointer items-center justify-center gap-3 rounded-md border border-slate-700 bg-white/7 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-white/12 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'
            >
              {redirecting ? (
                <LoaderCircle className='h-5 w-5 animate-spin' aria-hidden='true' />
              ) : (
                <UserIcon className='h-5 w-5' aria-hidden='true' />
              )}
              {redirecting ? 'Redirecting…' : 'Sign in with UMCCR account'}
            </button>

            <div className='flex items-center gap-3'>
              <div className='h-px flex-1 bg-slate-800' />
              <span className='text-[11px] font-medium tracking-wider text-slate-600 uppercase'>
                Secure UMCCR SSO
              </span>
              <div className='h-px flex-1 bg-slate-800' />
            </div>

            <p className='text-center text-xs leading-relaxed text-slate-500'>
              Access is restricted to authorised UMCCR personnel. By signing in you agree to the
              organisation&apos;s data governance policies.
            </p>
          </div>
        </div>

        <div className='mt-8 flex flex-col items-center gap-3'>
          <Image
            src={`${process.env.NEXT_PUBLIC_BASE_PATH}/assets/logo/uomlogo.png`}
            alt='University of Melbourne'
            width={32}
            height={32}
            className='h-8 w-8 opacity-60 brightness-200 grayscale transition-opacity hover:opacity-80'
          />
          <p className='text-xs text-slate-400'>
            &copy; {new Date().getFullYear()}{' '}
            <a
              href='https://umccr.org'
              target='_blank'
              rel='noreferrer'
              className='underline decoration-slate-400/40 underline-offset-2 transition-colors hover:text-slate-300'
            >
              UMCCR
            </a>
            {' · '}University of Melbourne Centre for Cancer Research
          </p>
        </div>
      </div>
    </div>
  );
}
