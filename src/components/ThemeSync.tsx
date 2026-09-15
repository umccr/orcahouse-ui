'use client';

import { useLayoutEffect } from 'react';
import { applyTheme, watchSystemTheme } from '@/lib/theme';

/**
 * Keeps <html data-theme> in step with the stored preference after the inline head script
 * has set it: follows system changes and other tabs, and re-applies it after React's
 * development remount resets the attributes on <html>.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    const update = () => applyTheme();
    update();
    const stopWatching = watchSystemTheme(update);
    window.addEventListener('storage', update);
    return () => {
      stopWatching();
      window.removeEventListener('storage', update);
    };
  }, []);

  return null;
}
