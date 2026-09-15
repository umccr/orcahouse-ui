import Link from 'next/link';
import { UserMenu } from './UserMenu';

export function AppHeader() {
  return (
    <header className='border-line bg-surface/90 dark:border-line-dark dark:bg-surface-dark/90 sticky top-0 z-20 border-b backdrop-blur'>
      <div className='flex h-14 items-center justify-between gap-4 px-4 sm:px-6'>
        <Link href='/' className='flex items-center gap-2 text-sm font-semibold'>
          <span className='bg-signal inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white'>
            OH
          </span>
          <span>OrcaHouse</span>
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}
