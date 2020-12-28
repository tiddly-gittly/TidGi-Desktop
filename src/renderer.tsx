/* eslint-disable promise/always-return */
import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';

import CssBaseline from '@material-ui/core/CssBaseline';
import { I18nextProvider } from 'react-i18next';

import 'typeface-roboto/index.css';

import store from './state';
import { init as initDialogCodeInjection } from './state/dialog-code-injection/actions';
import { init as initDialogCustomUserAgent } from './state/dialog-custom-user-agent/actions';
import { init as initDialogEditWorkspace } from './state/dialog-edit-workspace/actions';
import { init as initDialogProxy } from './state/dialog-proxy/actions';
import { init as initDialogSpellcheckLanguages } from './state/dialog-spellcheck-languages/actions';

import index18n from './i18n';

// @ts-expect-error ts-migrate(6142) FIXME: Module './components/app-wrapper' was resolved to ... Remove this comment to see the full error message
import AppWrapper from './components/app-wrapper';

import getWorkspacesAsList from './helpers/get-workspaces-as-list';

// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-about' was resolved to... Remove this comment to see the full error message
const DialogAbout = React.lazy(() => import('./components/dialog-about'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-add-workspace' was res... Remove this comment to see the full error message
const DialogAddWorkspace = React.lazy(() => import('./components/dialog-add-workspace'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-auth' was resolved to ... Remove this comment to see the full error message
const DialogAuth = React.lazy(() => import('./components/dialog-auth'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-code-injection' was re... Remove this comment to see the full error message
const DialogCodeInjection = React.lazy(() => import('./components/dialog-code-injection'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-custom-user-agent' was... Remove this comment to see the full error message
const DialogCustomUserAgent = React.lazy(() => import('./components/dialog-custom-user-agent'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-display-media' was res... Remove this comment to see the full error message
const DialogDisplayMedia = React.lazy(() => import('./components/dialog-display-media'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-edit-workspace' was re... Remove this comment to see the full error message
const DialogEditWorkspace = React.lazy(() => import('./components/dialog-edit-workspace'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-go-to-url' was resolve... Remove this comment to see the full error message
const DialogGoToUrl = React.lazy(() => import('./components/dialog-go-to-url'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-notifications' was res... Remove this comment to see the full error message
const DialogNotifications = React.lazy(() => import('./components/dialog-notifications'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-open-url-with' was res... Remove this comment to see the full error message
const DialogOpenUrlWith = React.lazy(() => import('./components/dialog-open-url-with'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-preferences' was resol... Remove this comment to see the full error message
const DialogPreferences = React.lazy(() => import('./components/dialog-preferences'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-proxy' was resolved to... Remove this comment to see the full error message
const DialogProxy = React.lazy(() => import('./components/dialog-proxy'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/dialog-spellcheck-languages' ... Remove this comment to see the full error message
const DialogSpellcheckLanguages = React.lazy(() => import('./components/dialog-spellcheck-languages'));
// @ts-expect-error ts-migrate(6142) FIXME: Module './components/main' was resolved to '/Users... Remove this comment to see the full error message
const Main = React.lazy(() => import('./components/main'));

declare global {
  interface Window {
    meta: {
      windowName: string;
    };
    remote: any;
    preventClosingWindow: boolean;
  }
}

const App = () => {
  switch (window.meta.windowName) {
    case 'about':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogAbout />;
    case 'add-workspace':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogAddWorkspace />;
    case 'auth':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogAuth />;
    case 'code-injection':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogCodeInjection />;
    case 'custom-user-agent':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogCustomUserAgent />;
    case 'display-media':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogDisplayMedia />;
    case 'edit-workspace':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogEditWorkspace />;
    case 'go-to-url':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogGoToUrl />;
    case 'notifications':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogNotifications />;
    case 'open-url-with':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogOpenUrlWith />;
    case 'preferences':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogPreferences />;
    case 'proxy':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogProxy />;
    case 'spellcheck-languages':
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <DialogSpellcheckLanguages />;
    default:
      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      return <Main />;
  }
};

const runApp = () => {
  Promise.resolve()
    .then(() => {
      window.remote.webFrame.setVisualZoomLevelLimits(1, 1);
      if (window.meta.windowName === 'about') {
        document.title = 'About';
      } else if (window.meta.windowName === 'add-workspace') {
        document.title = 'Add Workspace';
      } else if (window.meta.windowName === 'auth') {
        document.title = 'Sign In';
      } else if (window.meta.windowName === 'preferences') {
        document.title = 'Preferences';
      } else if (window.meta.windowName === 'edit-workspace') {
        store.dispatch(initDialogEditWorkspace());
        const { workspaces } = store.getState();
        const workspaceList = getWorkspacesAsList(workspaces);
        const editWorkspaceId = window.remote.getGlobal('editWorkspaceId');
        const workspace = workspaces[editWorkspaceId];
        workspaceList.some((item, index) => {
          // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
          if (item.id === editWorkspaceId) {
            workspace.order = index;
            return true;
          }
          return false;
        });
        document.title = workspace.name ? `Edit Workspace ${workspace.order + 1} "${workspace.name}"` : `Edit Workspace ${workspace.order + 1}`;
      } else if (window.meta.windowName === 'open-url-with') {
        document.title = 'Open Link With';
      } else if (window.meta.windowName === 'code-injection') {
        store.dispatch(initDialogCodeInjection());
        const codeInjectionType = window.remote.getGlobal('codeInjectionType');
        document.title = `Edit ${codeInjectionType.toUpperCase()} Code Injection`;
      } else if (window.meta.windowName === 'notifications') {
        document.title = 'Notifications';
      } else if (window.meta.windowName === 'display-media') {
        document.title = 'Share your Screen';
      } else if (window.meta.windowName === 'custom-user-agent') {
        store.dispatch(initDialogCustomUserAgent());
        document.title = 'Edit Custom User Agent';
      } else if (window.meta.windowName === 'go-to-url') {
        document.title = 'Go to URL';
      } else if (window.meta.windowName === 'proxy') {
        store.dispatch(initDialogProxy());
        document.title = 'Proxy Settings';
      } else if (window.meta.windowName === 'spellcheck-languages') {
        store.dispatch(initDialogSpellcheckLanguages());
        document.title = 'Preferred Spell Checking Languages';
      } else {
        document.title = 'TiddlyGit';
      }

      if (window.meta.windowName !== 'main' && window.meta.windowName !== 'menubar') {
        document.addEventListener('keydown', (event) => {
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
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Provider store={store}>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <AppWrapper>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <CssBaseline />
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <React.Suspense fallback={<div />}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <I18nextProvider i18n={index18n}>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <App />
          </I18nextProvider>
        </React.Suspense>
      </AppWrapper>
    </Provider>,
    document.querySelector('#app'),
  );
};

runApp();
