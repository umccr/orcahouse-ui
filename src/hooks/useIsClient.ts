import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** False during SSR and hydration, true once the component runs in the browser. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
