/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable promise/always-return */
import i18n from 'i18next';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { ThemeProvider } from 'styled-components';
import { Router } from 'wouter';

import CssBaseline from '@mui/material/CssBaseline';
import StyledEngineProvider from '@mui/material/StyledEngineProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import 'simplebar/dist/simplebar.min.css';

import { darkTheme, lightTheme } from '@services/theme/defaultTheme';
import { useThemeObservable } from '@services/theme/hooks';
import { initI18N } from './i18n';
import 'electron-ipc-cat/fixContextIsolation';
import { RootStyle } from './components/RootStyle';
import { useHashLocation } from './helpers/router';
import { Pages } from './pages';

function App(): JSX.Element {
  const theme = useThemeObservable();

  return (
    <ThemeProvider theme={theme?.shouldUseDarkColors === true ? darkTheme : lightTheme}>
      <StyledEngineProvider injectFirst>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <CssBaseline />
          <React.Suspense fallback={<div />}>
            <I18nextProvider i18n={i18n}>
              <RootStyle>
                <Router hook={useHashLocation}>
                  <Pages />
                </Router>
              </RootStyle>
            </I18nextProvider>
          </React.Suspense>
        </LocalizationProvider>
      </StyledEngineProvider>
    </ThemeProvider>
  );
}

window.remote.setVisualZoomLevelLimits(1, 1);
const container = document.querySelector('#app');
const root = createRoot(container!);
root.render(<App />);

void initI18N();
