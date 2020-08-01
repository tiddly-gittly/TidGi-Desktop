/* eslint-disable promise/always-return */
import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';

import CssBaseline from '@material-ui/core/CssBaseline';

import 'typeface-roboto/index.css';

import store from './state';
import { init as initDialogCodeInjection } from './state/dialog-code-injection/actions';
import { init as initDialogCustomUserAgent } from './state/dialog-custom-user-agent/actions';
import { init as initDialogEditWorkspace } from './state/dialog-edit-workspace/actions';
import { init as initDialogProxy } from './state/dialog-proxy/actions';
import { init as initDialogSpellcheckLanguages } from './state/dialog-spellcheck-languages/actions';

import AppWrapper from './components/app-wrapper';

import getWorkspacesAsList from './helpers/get-workspaces-as-list';

const DialogAbout = React.lazy(() => import('./components/dialog-about'));
const DialogAddWorkspace = React.lazy(() => import('./components/dialog-add-workspace'));
const DialogAuth = React.lazy(() => import('./components/dialog-auth'));
const DialogCodeInjection = React.lazy(() => import('./components/dialog-code-injection'));
const DialogCustomUserAgent = React.lazy(() => import('./components/dialog-custom-user-agent'));
const DialogDisplayMedia = React.lazy(() => import('./components/dialog-display-media'));
const DialogEditWorkspace = React.lazy(() => import('./components/dialog-edit-workspace'));
const DialogGoToUrl = React.lazy(() => import('./components/dialog-go-to-url'));
const DialogNotifications = React.lazy(() => import('./components/dialog-notifications'));
const DialogOpenUrlWith = React.lazy(() => import('./components/dialog-open-url-with'));
const DialogPreferences = React.lazy(() => import('./components/dialog-preferences'));
const DialogProxy = React.lazy(() => import('./components/dialog-proxy'));
const DialogSpellcheckLanguages = React.lazy(() => import('./components/dialog-spellcheck-languages'));
const Main = React.lazy(() => import('./components/main'));

const App = () => {
  switch (window.meta.mode) {
    case 'about':
      return <DialogAbout />;
    case 'add-workspace':
      return <DialogAddWorkspace />;
    case 'auth':
      return <DialogAuth />;
    case 'code-injection':
      return <DialogCodeInjection />;
    case 'custom-user-agent':
      return <DialogCustomUserAgent />;
    case 'display-media':
      return <DialogDisplayMedia />;
    case 'edit-workspace':
      return <DialogEditWorkspace />;
    case 'go-to-url':
      return <DialogGoToUrl />;
    case 'notifications':
      return <DialogNotifications />;
    case 'open-url-with':
      return <DialogOpenUrlWith />;
    case 'preferences':
      return <DialogPreferences />;
    case 'proxy':
      return <DialogProxy />;
    case 'spellcheck-languages':
      return <DialogSpellcheckLanguages />;
    default:
      return <Main />;
  }
};

const runApp = () => {
  Promise.resolve()
    .then(() => {
      window.remote.webFrame.setVisualZoomLevelLimits(1, 1);
      if (window.meta.mode === 'about') {
        document.title = 'About';
      } else if (window.meta.mode === 'add-workspace') {
        document.title = 'Add Workspace';
      } else if (window.meta.mode === 'auth') {
        document.title = 'Sign In';
      } else if (window.meta.mode === 'preferences') {
        document.title = 'Preferences';
      } else if (window.meta.mode === 'edit-workspace') {
        store.dispatch(initDialogEditWorkspace());
        const { workspaces } = store.getState();
        const workspaceList = getWorkspacesAsList(workspaces);
        const editWorkspaceId = window.remote.getGlobal('editWorkspaceId');
        const workspace = workspaces[editWorkspaceId];
        workspaceList.some((item, index) => {
          if (item.id === editWorkspaceId) {
            workspace.order = index;
            return true;
          }
          return false;
        });
        document.title = workspace.name
          ? `Edit Workspace ${workspace.order + 1} "${workspace.name}"`
          : `Edit Workspace ${workspace.order + 1}`;
      } else if (window.meta.mode === 'open-url-with') {
        document.title = 'Open Link With';
      } else if (window.meta.mode === 'code-injection') {
        store.dispatch(initDialogCodeInjection());
        const codeInjectionType = remote.getGlobal('codeInjectionType');
        document.title = `Edit ${codeInjectionType.toUpperCase()} Code Injection`;
      } else if (window.meta.mode === 'notifications') {
        document.title = 'Notifications';
      } else if (window.meta.mode === 'display-media') {
        document.title = 'Share your Screen';
      } else if (window.meta.mode === 'custom-user-agent') {
        store.dispatch(initDialogCustomUserAgent());
        document.title = 'Edit Custom User Agent';
      } else if (window.meta.mode === 'go-to-url') {
        document.title = 'Go to URL';
      } else if (window.meta.mode === 'proxy') {
        store.dispatch(initDialogProxy());
        document.title = 'Proxy Settings';
      } else if (window.meta.mode === 'spellcheck-languages') {
        store.dispatch(initDialogSpellcheckLanguages());
        document.title = 'Preferred Spell Checking Languages';
      } else {
        document.title = 'TiddlyGit';
      }

      if (window.meta.mode !== 'main' && window.meta.mode !== 'menubar') {
        document.addEventListener('keydown', event => {
          if (event.key === 'Escape') {
            if (window.preventClosingWindow) {
              return;
            }
            window.remote.closeCurrentWindow();
          }
        });
      }
    })
    .catch(console.error);

  ReactDOM.render(
    <Provider store={store}>
      <AppWrapper>
        <CssBaseline />
        <React.Suspense fallback={<div />}>
          <App />
        </React.Suspense>
      </AppWrapper>
    </Provider>,
    document.querySelector('#app'),
  );
};

runApp();
