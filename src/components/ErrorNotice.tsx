import type { ReactNode } from 'react';

interface Props {
  title: string;
  message?: string;
  children?: ReactNode;
}

export function ErrorNotice({ title, message, children }: Props) {
  return (
    <div
      role='alert'
      className='rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
    >
      <p className='font-semibold'>{title}</p>
      {message && <p className='mt-1 break-words'>{message}</p>}
      {children && <div className='mt-2'>{children}</div>}
    </div>
  );
}
