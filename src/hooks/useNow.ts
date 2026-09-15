import { useEffect, useState } from 'react';

/** Current time, refreshed on an interval, for countdown-style labels. Null until mounted. */
export function useNow(intervalMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
