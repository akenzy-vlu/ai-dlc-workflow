import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import 'antd/dist/reset.css';
import '@app/theme/app.css';

import { AppProviders } from '@app/providers';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
);
