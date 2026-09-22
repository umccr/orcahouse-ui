export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'orcahouse-ui.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Inline <head> script that sets data-theme before the first paint, so a stored preference
 * applies without a flash. Keep it, and the literal storage key and media query inside it, in
 * step with THEME_STORAGE_KEY, DARK_QUERY and applyTheme below.
 *
 * Written out as a fixed string rather than built by interpolating those constants into it:
 * this is injected into <head> via dangerouslySetInnerHTML, so splicing a value into it, even
 * this module's own constant, is exactly the "code built from an interpolated value" pattern
 * CodeQL's js/bad-code-sanitization flags (a later, easy-to-miss change to either constant, such
 * as reading one from configuration, would turn this into a real DOM-based injection).
 */
export const THEME_SCRIPT = `(function(){var p;try{p=localStorage.getItem("orcahouse-ui.theme")}catch(e){}var d=p==='dark'||(p!=='light'&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')})()`;

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
