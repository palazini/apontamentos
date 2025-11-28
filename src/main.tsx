import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './utils/pdfConfig';

// Mantine (só styles base via CSS por enquanto)
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dropzone/styles.css';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider
      defaultColorScheme="light"
      theme={{
        primaryColor: 'brand',
        colors: {
          brand: [
            '#ecebff', '#dcd9ff', '#b7b0ff', '#9387ff', '#6e5dff',
            '#4a35ff', '#3c2be0', '#2f22b8', '#211a90', '#0800A8',
          ],
        },
        primaryShade: 9,
        defaultRadius: 'lg',
        shadows: { sm: '0 4px 16px rgba(16, 24, 40, 0.08)' },
        fontFamily: 'Inter, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        headings: { fontWeight: '700' },
      }}
    >
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
