'use client';

import type { ReactNode } from 'react';
import {
  Description,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Dialog as HeadlessDialog,
} from '@headlessui/react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  size?: 'sm' | 'lg';
  children: ReactNode;
}

/**
 * Modal frame with a title bar and close button. Its children unmount when it closes, so
 * per-open state (a freshly fetched token, say) belongs in them.
 */
export function Dialog({ open, onClose, title, description, icon, size = 'sm', children }: Props) {
  return (
    <HeadlessDialog open={open} onClose={onClose} className='relative z-50'>
      <DialogBackdrop
        transition
        className='fixed inset-0 bg-black/50 transition-opacity duration-200 ease-out data-closed:opacity-0 dark:bg-black/60'
      />
      <div className='fixed inset-0 overflow-y-auto p-4'>
        <div className='flex min-h-full items-center justify-center'>
          <DialogPanel
            transition
            className={`border-line bg-surface dark:border-line-dark dark:bg-surface-dark w-full overflow-hidden rounded-lg border shadow-xl transition duration-200 ease-out data-closed:translate-y-3 data-closed:opacity-0 ${
              size === 'lg' ? 'max-w-xl' : 'max-w-md'
            }`}
          >
            <div className='border-line dark:border-line-dark flex items-start justify-between gap-3 border-b px-5 py-4'>
              <div className='flex min-w-0 items-center gap-3'>
                {icon && (
                  <div className='bg-signal/10 text-signal flex h-9 w-9 shrink-0 items-center justify-center rounded-md'>
                    {icon}
                  </div>
                )}
                <div className='min-w-0'>
                  <DialogTitle className='truncate text-base font-semibold'>{title}</DialogTitle>
                  {description && (
                    <Description className='text-muted dark:text-muted-dark truncate text-xs'>
                      {description}
                    </Description>
                  )}
                </div>
              </div>
              <button
                type='button'
                onClick={onClose}
                aria-label='Close dialog'
                className='text-muted dark:text-muted-dark dark:hover:bg-raised-dark rounded-md p-1.5 hover:bg-slate-100 hover:text-inherit'
              >
                <X className='h-4 w-4' aria-hidden='true' />
              </button>
            </div>
            <div className='p-5'>{children}</div>
          </DialogPanel>
        </div>
      </div>
    </HeadlessDialog>
  );
}
