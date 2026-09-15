export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'orcahouse-ui.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Inline <head> script that sets data-theme before the first paint, so a stored preference
 * applies without a flash. Keep it in step with applyTheme below.
 */
export const THEME_SCRIPT = `(function(){var p;try{p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}var d=p==='dark'||(p!=='light'&&matchMedia(${JSON.stringify(DARK_QUERY)}).matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')})()`;

export function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(preference: ThemePreference = readThemePreference()): void {
  const dark =
    preference === 'dark' || (preference === 'system' && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

/** Calls the listener when the system colour scheme changes. Returns an unsubscribe. */
export function watchSystemTheme(listener: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
