'use client';

import { useState } from 'react';
import {
  Menu,
  MenuButton,
  MenuHeading,
  MenuItem,
  MenuItems,
  MenuSection,
  MenuSeparator,
} from '@headlessui/react';
import { LogOut, Settings, User, UserKey, type LucideIcon } from 'lucide-react';
import { initials } from '@/lib/auth';
import { useAuth } from './AuthGate';
import { ProfileDialog } from './ProfileDialog';
import { SettingsDialog } from './SettingsDialog';
import { TokenDialog } from './TokenDialog';

type Panel = 'profile' | 'token' | 'settings';

const ITEMS: { panel: Panel; label: string; icon: LucideIcon }[] = [
  { panel: 'profile', label: 'Profile', icon: User },
  { panel: 'token', label: 'Token', icon: UserKey },
  { panel: 'settings', label: 'Settings', icon: Settings },
];

const ITEM =
  'flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-[13px] font-medium';

/** Avatar button in the header, with the signed-in user's menu. */
export function UserMenu() {
  const { user, signOut } = useAuth();
  const [panel, setPanel] = useState<Panel | null>(null);
  const closePanel = () => setPanel(null);

  return (
    <>
      <Menu as='div' className='relative'>
        <MenuButton className='dark:hover:bg-raised-dark dark:data-active:bg-raised-dark flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1 hover:bg-slate-100 data-active:bg-slate-100'>
          <span className='hidden text-[13px] leading-none font-semibold md:block'>
            {user.name}
          </span>
          <span
            aria-hidden='true'
            className='flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-orange-400 to-pink-400 text-xs font-semibold text-white'
          >
            {initials(user.name)}
          </span>
          <span className='sr-only md:hidden'>Account menu for {user.name}</span>
        </MenuButton>

        <MenuItems
          anchor='bottom end'
          transition
          className='border-line bg-surface dark:border-line-dark dark:bg-surface-dark z-40 w-56 origin-top-right rounded-lg border shadow-lg transition duration-150 ease-out outline-none [--anchor-gap:--spacing(1)] data-closed:scale-95 data-closed:opacity-0 dark:shadow-black/40'
        >
          <MenuSection className='border-line dark:border-line-dark border-b px-3 py-2.5'>
            <MenuHeading className='text-muted dark:text-muted-dark text-[11px] font-normal'>
              Signed in as
            </MenuHeading>
            <p className='mt-0.5 truncate text-[13px] font-medium' title={user.email}>
              {user.email}
            </p>
          </MenuSection>

          <div className='p-1'>
            {ITEMS.map(({ panel: id, label, icon: Icon }) => (
              <MenuItem key={id}>
                {({ close }) => (
                  <button
                    type='button'
                    onClick={() => {
                      setPanel(id);
                      close();
                    }}
                    className={`${ITEM} dark:data-focus:bg-raised-dark text-slate-700 data-focus:bg-slate-100 dark:text-slate-300`}
                  >
                    <Icon className='h-4 w-4 shrink-0' aria-hidden='true' />
                    {label}
                  </button>
                )}
              </MenuItem>
            ))}
          </div>

          <MenuSeparator className='border-line dark:border-line-dark border-t' />

          <div className='p-1'>
            <MenuItem>
              {({ close }) => (
                <button
                  type='button'
                  onClick={() => {
                    close();
                    void signOut();
                  }}
                  className={`${ITEM} text-red-600 data-focus:bg-red-50 dark:text-red-400 dark:data-focus:bg-red-500/10`}
                >
                  <LogOut className='h-4 w-4 shrink-0' aria-hidden='true' />
                  Sign out
                </button>
              )}
            </MenuItem>
          </div>
        </MenuItems>
      </Menu>

      <ProfileDialog user={user} open={panel === 'profile'} onClose={closePanel} />
      <TokenDialog open={panel === 'token'} onClose={closePanel} />
      <SettingsDialog open={panel === 'settings'} onClose={closePanel} />
    </>
  );
}
