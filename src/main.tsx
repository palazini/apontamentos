import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Mantine (só styles base via CSS por enquanto)
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dropzone/styles.css';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

const brand = [
  '#e7e6ff', '#c5c2ff', '#a19cff', '#7b74ff', '#574dff',
  '#3c33f1', '#2b25c7', '#1d199e', '#120f77', '#0800A8'
];

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
