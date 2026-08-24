import { useEffect } from 'react';
import { App as AntApp, ConfigProvider } from 'antd';

import { systemThemeChanged, useAppDispatch } from '@app/store';
import { preferencesRepository } from '@data/repositories';
import { darkTheme, lightTheme } from './theme';

/**
 * Applies the resolved theme to both halves of the system.
 *
 * `data-theme` on `<html>` is what `assets/theme.css` switches on; Ant Design gets the
 * matching algorithm. Keeping them in one place is what stops the CSS custom properties
 * and the component tokens from disagreeing about which mode is showing.
 *
 * The *initial* resolution runs in a blocking script in `index.html`, before React mounts.
 * Doing it here instead flashes a white screen at every dark-mode load, which is the one
 * thing a dark theme must not do.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const { resolved } = preferencesRepository.useThemePreference();

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      dispatch(systemThemeChanged(query.matches ? 'dark' : 'light'));
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [dispatch]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  return (
    <ConfigProvider theme={resolved === 'dark' ? darkTheme : lightTheme}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
