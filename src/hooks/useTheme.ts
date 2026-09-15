import { useSyncExternalStore } from 'react';
import {
  applyTheme,
  readThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '@/lib/theme';

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage unavailable: the choice still applies until the page reloads.
  }
  applyTheme(preference);
  listeners.forEach((listener) => listener());
}

/** The stored theme preference; "system" on the server and until hydration. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readThemePreference, () => 'system');
}
