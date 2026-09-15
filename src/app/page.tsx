import { Suspense } from 'react';
import { MartView } from '@/components/MartView';

export default function HomePage() {
  return (
    <Suspense fallback={<p className='text-muted dark:text-muted-dark text-sm'>Loading…</p>}>
      <MartView />
    </Suspense>
  );
}
