import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';

import { store } from '@app/store';
import { ThemeProvider } from '@app/theme';
import { router } from '@app/router';

/**
 * The composition root, in the only order that works.
 *
 * Redux is outermost because the theme reads its preference from the store; the router is
 * innermost because every route depends on both.
 */
export function AppProviders() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </Provider>
  );
}
