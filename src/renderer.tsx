/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable promise/always-return */
import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import i18n from 'i18next';

import CssBaseline from '@material-ui/core/CssBaseline';
import { I18nextProvider } from 'react-i18next';
import { WindowNames, WindowMeta } from '@services/windows/WindowProperties';

import 'typeface-roboto/index.css';

import store from './state';
import { init as initDialogCustomUserAgent } from './state/dialog-custom-user-agent/actions';
import { init as initDialogEditWorkspace } from './state/dialog-edit-workspace/actions';
import { init as initDialogProxy } from './state/dialog-proxy/actions';
import { init as initDialogSpellcheckLanguages } from './state/dialog-spellcheck-languages/actions';

import { initI18N } from './i18n';

import AppWrapper from './components/app-wrapper';

const AboutPage = React.lazy(async () => await import('./pages/About'));
const DialogAddWorkspace = React.lazy(async () => await import('./pages/AddWorkspace'));
const DialogAuth = React.lazy(async () => await import('./components/dialog-auth'));
const DialogCustomUserAgent = React.lazy(async () => await import('./components/dialog-custom-user-agent'));
const DialogDisplayMedia = React.lazy(async () => await import('./components/dialog-display-media'));
const DialogEditWorkspace = React.lazy(async () => await import('./components/dialog-edit-workspace'));
const DialogGoToUrl = React.lazy(async () => await import('./components/dialog-go-to-url'));
const DialogNotifications = React.lazy(async () => await import('./components/dialog-notifications'));
const DialogOpenUrlWith = React.lazy(async () => await import('./components/dialog-open-url-with'));
const DialogPreferences = React.lazy(async () => await import('./components/dialog-preferences'));
const DialogProxy = React.lazy(async () => await import('./components/dialog-proxy'));
const DialogSpellcheckLanguages = React.lazy(async () => await import('./components/dialog-spellcheck-languages'));
const Main = React.lazy(async () => await import('./pages/Main'));

const App = (): JSX.Element => {
  switch (window.meta.windowName) {
    case WindowNames.about:
      document.title = 'About';
      return <AboutPage />;
    case WindowNames.addWorkspace:
      document.title = 'Add Workspace';
      return <DialogAddWorkspace />;
    case WindowNames.auth:
      document.title = 'Sign In';
      return <DialogAuth />;
    case WindowNames.userAgent:
      return <DialogCustomUserAgent />;
    case WindowNames.displayMedia:
      document.title = 'Share your Screen';
      return <DialogDisplayMedia />;
    case WindowNames.editWorkspace:
      return <DialogEditWorkspace />;
    case WindowNames.goToUrl:
      document.title = 'Go to URL';
      return <DialogGoToUrl />;
    case WindowNames.notifications:
      document.title = 'Notifications';
      return <DialogNotifications />;
    case WindowNames.openUrlWith:
      document.title = 'Open Link With';
      return <DialogOpenUrlWith />;
    case WindowNames.preferences:
      document.title = 'Preferences';
      return <DialogPreferences />;
    case WindowNames.proxy:
      return <DialogProxy />;
    case WindowNames.spellcheck:
      return <DialogSpellcheckLanguages />;
    default:
      document.title = 'TiddlyGit';
      return <Main />;
  }
};

async function runApp(): Promise<void> {
  window.electron.webFrame.setVisualZoomLevelLimits(1, 1);
  if (window.meta.windowName === WindowNames.editWorkspace) {
    const { workspaceID } = window.meta as WindowMeta[WindowNames.editWorkspace];
    store.dispatch(initDialogEditWorkspace());
    const { workspaces } = store.getState();
    const workspaceList = Object.values(workspaces);
    const workspace = workspaces[workspaceID];
    workspaceList.some((item, index) => {
      if (item.id === workspaceID) {
        workspace.order = index;
        return true;
      }
      return false;
    });
    document.title = workspace.name ? `Edit Workspace ${workspace.order + 1} "${workspace.name}"` : `Edit Workspace ${workspace.order + 1}`;
  } else if (window.meta.windowName === WindowNames.userAgent) {
    store.dispatch(initDialogCustomUserAgent());
    document.title = 'Edit Custom User Agent';
  } else if (window.meta.windowName === WindowNames.proxy) {
    store.dispatch(initDialogProxy());
    document.title = 'Proxy Settings';
  } else if (window.meta.windowName === WindowNames.spellcheck) {
    store.dispatch(initDialogSpellcheckLanguages());
    document.title = 'Preferred Spell Checking Languages';
  }

  // FIXME: handle && window.meta.windowName !== 'menubar' here
  if (window.meta.windowName !== WindowNames.main) {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (window.preventClosingWindow) {
          return;
        }
        window.remote.closeCurrentWindow();
      }
    });
  }

  ReactDOM.render(
    <Provider store={store}>
      <AppWrapper>
        <CssBaseline />
        <React.Suspense fallback={<div />}>
          <I18nextProvider i18n={i18n}>
            <App />
          </I18nextProvider>
        </React.Suspense>
      </AppWrapper>
    </Provider>,
    document.querySelector('#app'),
  );

  await initI18N();
}

void runApp();
