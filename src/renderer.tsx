/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable promise/always-return */
import React from 'react';
import ReactDOM from 'react-dom';
import i18n from 'i18next';
import LogRocket from 'logrocket';

import StyledEngineProvider from '@material-ui/core/StyledEngineProvider';
import DateFnsUtils from '@material-ui/lab/AdapterDateFns';
import LocalizationProvider from '@material-ui/lab/LocalizationProvider';
import CssBaseline from '@material-ui/core/CssBaseline';
import { I18nextProvider } from 'react-i18next';
import { WindowNames, WindowMeta, IPreferenceWindowMeta } from '@services/windows/WindowProperties';

import 'typeface-roboto/index.css';

import { initI18N } from './i18n';
import './helpers/electron-ipc-proxy/fixContextIsolation';
import { App } from './pages';

async function runApp(): Promise<void> {
  LogRocket.init('kkauk7/tiddlygit-desktop');

  void window.remote.setVisualZoomLevelLimits(1, 1);

  const attachToMenubar = await window.service.preference.get('attachToMenubar');
  if (window.meta.windowName !== WindowNames.main && attachToMenubar) {
    document.addEventListener('keydown', (_event) => {
      void (async () => {
        const { preventClosingWindow } = (await window.service.window.getWindowMeta(WindowNames.preferences)) as IPreferenceWindowMeta;
        if (window.meta.windowName === WindowNames.preferences && preventClosingWindow) {
          return;
        }
        void window.remote.closeCurrentWindow();
      })();
    });
  }

  ReactDOM.render(
    <>
      <StyledEngineProvider injectFirst>
        <LocalizationProvider dateAdapter={DateFnsUtils}>
          <CssBaseline />
          <React.Suspense fallback={<div />}>
            <I18nextProvider i18n={i18n}>
              <div id="test" data-usage="For spectron automating testing" />
              <App />
            </I18nextProvider>
          </React.Suspense>
        </LocalizationProvider>
      </StyledEngineProvider>
    </>,
    document.querySelector('#app'),
  );

  await initI18N();
}

void runApp();
