import { useCallback, useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'orcahouse-ui.sidenav-collapsed';
const listeners = new Set<() => void>();

// Mirrors localStorage, so folding still works for the session when storage is unavailable.
let stored: string | null = null;

function read(): string {
  if (stored === null) {
    try {
      stored = window.localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      stored = '';
    }
  }
  return stored;
}

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    stored = event.newValue ?? '';
    listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The side navigation groups the user has folded, remembered in this browser. */
export function useCollapsedGroups(): [ReadonlySet<string>, (groupId: string) => void] {
  const raw = useSyncExternalStore(subscribe, read, () => '');
  const collapsed = useMemo(() => new Set(raw.split(',').filter(Boolean)), [raw]);

  const toggle = useCallback((groupId: string) => {
    const next = new Set(read().split(',').filter(Boolean));
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    stored = [...next].join(',');
    try {
      window.localStorage.setItem(STORAGE_KEY, stored);
    } catch {
      // Storage unavailable: the folds last until the page reloads.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return [collapsed, toggle];
}
