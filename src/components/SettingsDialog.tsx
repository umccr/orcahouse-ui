'use client';

import { Check, Monitor, Moon, Settings, Sun, type LucideIcon } from 'lucide-react';
import { setThemePreference, useThemePreference } from '@/hooks/useTheme';
import type { ThemePreference } from '@/lib/theme';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  onClose: () => void;
}

const OPTIONS: { value: ThemePreference; label: string; description: string; icon: LucideIcon }[] =
  [
    { value: 'light', label: 'Light', description: 'For bright environments', icon: Sun },
    { value: 'dark', label: 'Dark', description: 'For low-light environments', icon: Moon },
    { value: 'system', label: 'System', description: 'Follows your device setting', icon: Monitor },
  ];

export function SettingsDialog({ open, onClose }: Props) {
  const preference = useThemePreference();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title='Theme'
      description='Choose how OrcaHouse looks in this browser'
      icon={<Settings className='h-4 w-4' aria-hidden='true' />}
    >
      <div role='radiogroup' aria-label='Theme' className='space-y-2'>
        {OPTIONS.map(({ value, label, description, icon: Icon }) => {
          const active = preference === value;
          return (
            <button
              key={value}
              type='button'
              role='radio'
              aria-checked={active}
              onClick={() => setThemePreference(value)}
              className={`flex w-full cursor-pointer items-center gap-4 rounded-lg border-2 p-3 text-left transition-colors ${
                active
                  ? 'border-signal bg-signal/10'
                  : 'border-line dark:border-line-dark dark:hover:bg-raised-dark hover:bg-slate-50'
              }`}
            >
              <span className='dark:bg-raised-dark flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100'>
                <Icon className='h-5 w-5' aria-hidden='true' />
              </span>
              <span className='flex-1'>
                <span className='block text-[13px] font-medium'>{label}</span>
                <span className='text-muted dark:text-muted-dark block text-[11px]'>
                  {description}
                </span>
              </span>
              {active && (
                <span className='bg-signal flex h-5 w-5 items-center justify-center rounded-full text-white'>
                  <Check className='h-3 w-3' strokeWidth={3} aria-hidden='true' />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
