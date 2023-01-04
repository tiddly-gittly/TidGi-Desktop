/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable promise/always-return */
import React from 'react';
import i18n from 'i18next';
import { ThemeProvider } from 'styled-components';
import { createRoot } from 'react-dom/client';

import StyledEngineProvider from '@material-ui/core/StyledEngineProvider';
import DateFnsUtils from '@material-ui/lab/AdapterDateFns';
import LocalizationProvider from '@material-ui/lab/LocalizationProvider';
import CssBaseline from '@material-ui/core/CssBaseline';
import { I18nextProvider } from 'react-i18next';
import 'typeface-roboto/index.css';

import { useThemeObservable } from '@services/theme/hooks';
import { darkTheme, lightTheme } from '@services/theme/defaultTheme';
import { initI18N } from './i18n';
import 'electron-ipc-cat/fixContextIsolation';
import { Pages } from './pages';
import { RootStyle } from './components/RootStyle';

function App(): JSX.Element {
  const theme = useThemeObservable();

  return (
    <ThemeProvider theme={theme?.shouldUseDarkColors === true ? darkTheme : lightTheme}>
      <StyledEngineProvider injectFirst>
        <LocalizationProvider dateAdapter={DateFnsUtils}>
          <CssBaseline />
          <React.Suspense fallback={<div />}>
            <I18nextProvider i18n={i18n}>
              <RootStyle>
                <Pages />
              </RootStyle>
            </I18nextProvider>
          </React.Suspense>
        </LocalizationProvider>
      </StyledEngineProvider>
    </ThemeProvider>
  );
}

void window.remote.setVisualZoomLevelLimits(1, 1);
const container = document.getElementById('app');
const root = createRoot(container!);
root.render(<App />);

void initI18N();
