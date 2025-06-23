import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import React, { JSX, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { Router } from 'wouter';
// Fix https://github.com/pnpm/pnpm/issues/6089
import type {} from '@mui/system';
import type {} from '@mui/types';

import CssBaseline from '@mui/material/CssBaseline';
import { StyledEngineProvider } from '@mui/material/styles';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import 'simplebar/dist/simplebar.min.css';

import { darkTheme, lightTheme } from '@services/theme/defaultTheme';
import { useThemeObservable } from '@services/theme/hooks';
import { initRendererI18N } from './services/libs/i18n/renderer';
import 'electron-ipc-cat/fixContextIsolation';
import { useHashLocation } from 'wouter/use-hash-location';
import { RootStyle } from './components/RootStyle';
import { Pages } from './windows';

function App(): JSX.Element {
  const theme = useThemeObservable();

  return (
    <StrictMode>
      <ThemeProvider theme={theme?.shouldUseDarkColors === true ? darkTheme : lightTheme}>
        <StyledEngineProvider injectFirst>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <CssBaseline />
            <Suspense fallback={<div />}>
              <I18nextProvider i18n={i18next}>
                <RootStyle>
                  <Router hook={useHashLocation}>
                    <Pages />
                  </Router>
                </RootStyle>
              </I18nextProvider>
            </Suspense>
          </LocalizationProvider>
        </StyledEngineProvider>
      </ThemeProvider>
    </StrictMode>
  );
}

window.remote.setVisualZoomLevelLimits(1, 1);
const container = document.querySelector('#app');
const root = createRoot(container!);
root.render(<App />);

void initRendererI18N();
