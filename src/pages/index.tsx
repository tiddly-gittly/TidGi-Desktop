import React from 'react';
import { WindowNames } from '@services/windows/WindowProperties';

import Main from './Main';
import AboutPage from './About';
import DialogAddWorkspace from './AddWorkspace';
import EditWorkspace from './EditWorkspace';
import DialogNotifications from './Notifications';
import DialogPreferences from './Preferences';
import SpellcheckLanguages from './SpellcheckLanguages';

export function App(): JSX.Element {
  switch (window.meta.windowName) {
    case WindowNames.about:
      document.title = 'About';
      return <AboutPage />;
    case WindowNames.addWorkspace:
      document.title = 'Add Workspace';
      return <DialogAddWorkspace />;
    case WindowNames.editWorkspace:
      return <EditWorkspace />;
    case WindowNames.notifications:
      document.title = 'Notifications';
      return <DialogNotifications />;
    case WindowNames.preferences:
      document.title = 'Preferences';
      return <DialogPreferences />;
    case WindowNames.spellcheck:
      return <SpellcheckLanguages />;
    default:
      document.title = 'TiddlyGit';
      return <Main />;
  }
}
