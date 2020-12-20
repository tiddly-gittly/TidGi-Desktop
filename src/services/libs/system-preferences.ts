// System Preferences are not stored in storage but stored in macOS Preferences.
// It can be retrieved and changed using Electron APIs

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'app'.
let { app, remote } = require('electron');

app = app || remote.app;

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'sendToAllW... Remove this comment to see the full error message
const sendToAllWindows = require('./send-to-all-windows');

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getSystemP... Remove this comment to see the full error message
const getSystemPreference = (name: any) => {
  switch (name) {
    case 'openAtLogin': {
      // return yes, yes-hidden, no
      const loginItemSettings = app.getLoginItemSettings();
      const { openAtLogin, openAsHidden } = loginItemSettings;
      if (openAtLogin && openAsHidden) return 'yes-hidden';
      if (openAtLogin) return 'yes';
      return 'no';
    }
    default: {
      return null;
    }
  }
};

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getSystemP... Remove this comment to see the full error message
const getSystemPreferences = () => ({
  openAtLogin: getSystemPreference('openAtLogin'),
});

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'setSystemP... Remove this comment to see the full error message
const setSystemPreference = (name: any, value: any) => {
  switch (name) {
    case 'openAtLogin': {
      app.setLoginItemSettings({
        openAtLogin: value.startsWith('yes'),
        openAsHidden: value === 'yes-hidden',
      });
      break;
    }
    default: {
      break;
    }
  }
  sendToAllWindows('set-system-preference', name, value);
};

module.exports = {
  getSystemPreference,
  getSystemPreferences,
  setSystemPreference,
};
