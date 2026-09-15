import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import './globals.css';
import { ApolloWrapper } from '@/components/ApolloWrapper';
import { AppHeader } from '@/components/AppHeader';
import { AuthGate } from '@/components/AuthGate';
import { SideNav } from '@/components/SideNav';
import { ThemeSync } from '@/components/ThemeSync';
import { THEME_SCRIPT } from '@/lib/theme';

// No title here: AuthGate and MartView render <title>, which follows the ?table= view.
export const metadata: Metadata = {
  description: 'Front end for the OrcaHouse data warehouse.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets data-theme on <html> before React hydrates.
    <html lang='en' suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className='min-h-screen'>
        <ThemeSync />
        <AuthGate>
          <ApolloWrapper>
            <AppHeader />
            <div className='flex'>
              <Suspense>
                <SideNav />
              </Suspense>
              <main className='min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8'>{children}</main>
            </div>
          </ApolloWrapper>
        </AuthGate>
      </body>
    </html>
  );
}
