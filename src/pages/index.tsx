import { WindowNames } from '@services/windows/WindowProperties';
import React from 'react';

import AboutPage from './About';
import { AddWorkspace as DialogAddWorkspace } from './AddWorkspace';
import EditWorkspace from './EditWorkspace';
import Main from './Main';
import DialogNotifications from './Notifications';
import DialogPreferences from './Preferences';
import SpellcheckLanguages from './SpellcheckLanguages';

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
