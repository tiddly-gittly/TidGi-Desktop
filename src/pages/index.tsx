/* eslint-disable @typescript-eslint/promise-function-async */
import { WindowNames } from '@services/windows/WindowProperties';
import { lazy } from 'react';

const AboutPage = lazy(() => import('./About'));
const DialogAddWorkspace = lazy(() => import('./AddWorkspace').then((module) => ({ default: module.AddWorkspace })));
const EditWorkspace = lazy(() => import('./EditWorkspace'));
const Main = lazy(() => import('./Main'));
const DialogNotifications = lazy(() => import('./Notifications'));
const DialogPreferences = lazy(() => import('./Preferences'));
const SpellcheckLanguages = lazy(() => import('./SpellcheckLanguages'));


export function Pages(): JSX.Element {
  switch (window.meta.windowName) {
    case WindowNames.about: {
      return <AboutPage />;
    }
    case WindowNames.addWorkspace: {
      return <DialogAddWorkspace />;
    }
    case WindowNames.editWorkspace: {
      return <EditWorkspace />;
    }
    case WindowNames.notifications: {
      return <DialogNotifications />;
    }
    case WindowNames.preferences: {
      return <DialogPreferences />;
    }
    case WindowNames.spellcheck: {
      return <SpellcheckLanguages />;
    }
    default: {
      return <Main />;
    }
  }
}
