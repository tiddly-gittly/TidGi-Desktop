/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable promise/always-return */
import React from 'react';
import ReactDOM from 'react-dom';
import i18n from 'i18next';

import CssBaseline from '@material-ui/core/CssBaseline';
import { I18nextProvider } from 'react-i18next';
import { WindowNames, WindowMeta, IPreferenceWindowMeta } from '@services/windows/WindowProperties';

import 'typeface-roboto/index.css';

import { initI18N } from './i18n';

import AppWrapper from './components/app-wrapper';

const Main = React.lazy(async () => await import('./pages/Main'));
const AboutPage = React.lazy(async () => await import('./pages/About'));
const DialogAddWorkspace = React.lazy(async () => await import('./pages/AddWorkspace'));
const DialogEditWorkspace = React.lazy(async () => await import('./components/dialog-edit-workspace'));
const DialogNotifications = React.lazy(async () => await import('./components/dialog-notifications'));
const DialogPreferences = React.lazy(async () => await import('./pages/Preferences'));
const DialogSpellcheckLanguages = React.lazy(async () => await import('./components/dialog-spellcheck-languages'));

const App = (): JSX.Element => {
  switch (window.meta.windowName) {
    case WindowNames.about:
      document.title = 'About';
      return <AboutPage />;
    case WindowNames.addWorkspace:
      document.title = 'Add Workspace';
      return <DialogAddWorkspace />;
    case WindowNames.editWorkspace:
      return <DialogEditWorkspace />;
    case WindowNames.notifications:
      document.title = 'Notifications';
      return <DialogNotifications />;
    case WindowNames.preferences:
      document.title = 'Preferences';
      return <DialogPreferences />;
    case WindowNames.spellcheck:
      return <DialogSpellcheckLanguages />;
    default:
      document.title = 'TiddlyGit';
      return <Main />;
  }
};

async function runApp(): Promise<void> {
  void window.service.window.setVisualZoomLevelLimits(1, 1);
  if (window.meta.windowName === WindowNames.editWorkspace) {
    const { workspaceID } = window.meta as WindowMeta[WindowNames.editWorkspace];
    if (workspaceID === undefined) {
      throw new Error(`workspaceID is undefined,  window.meta is ${typeof window.meta === 'object' ? JSON.stringify(window.meta) : String(window.meta)}`);
    }
    const workspaces = await window.service.workspace.getWorkspaces();
    const workspaceList = await window.service.workspace.getWorkspacesAsList();
    const workspace = workspaces[workspaceID];
    workspaceList.some((item, index) => {
      if (item.id === workspaceID) {
        workspace.order = index;
        return true;
      }
      return false;
    });
    document.title = workspace.name ? `Edit Workspace ${workspace.order + 1} "${workspace.name}"` : `Edit Workspace ${workspace.order + 1}`;
  } else if (window.meta.windowName === WindowNames.spellcheck) {
    document.title = 'Preferred Spell Checking Languages';
  }

  const attachToMenubar = (await window.service.preference.get('attachToMenubar')) as boolean;
  if (window.meta.windowName !== WindowNames.main && attachToMenubar) {
    document.addEventListener('keydown', (_event) => {
      void (async () => {
        const { preventClosingWindow } = (await window.service.window.getWindowMeta(WindowNames.preferences)) as IPreferenceWindowMeta;
        if (window.meta.windowName === WindowNames.preferences && preventClosingWindow) {
          return;
        }
        window.remote.closeCurrentWindow();
      })();
    });
  }

  ReactDOM.render(
    <>
      <AppWrapper>
        <CssBaseline />
        <React.Suspense fallback={<div />}>
          <I18nextProvider i18n={i18n}>
            <App />
          </I18nextProvider>
        </React.Suspense>
      </AppWrapper>
    </>,
    document.querySelector('#app'),
  );

  await initI18N();
}

void runApp();
