const { ipcMain } = require('electron');
const settings = require('electron-settings');

const sendToAllWindows = require('../libs/send-to-all-windows');

// scope
const v = '2018.2';

const defaultPreferences = {
  attachToMenubar: false,
  cssCodeInjection: null,
  jsCodeInjection: null,
  navigationBar: false,
  registered: false,
  rememberLastPageVisited: false,
  shareWorkspaceBrowsingData: false,
  spellChecker: true,
  swipeToNavigate: true,
  theme: process.platform === 'darwin' ? 'automatic' : 'light',
  unreadCountBadge: true,
};

const getPreferences = () => ({ ...defaultPreferences, ...settings.get(`preferences.${v}`) });

const getPreference = (name) => {
  if (settings.has(`preferences.${v}.${name}`)) {
    return settings.get(`preferences.${v}.${name}`);
  }
  return defaultPreferences[name];
};

const setPreference = (name, value) => {
  settings.set(`preferences.${v}.${name}`, value);
  sendToAllWindows('set-preference', name, value);

  if (name === 'registered') {
    ipcMain.emit('create-menu');
  }
};

const resetPreferences = () => {
  settings.deleteAll();

  const preferences = getPreferences();
  Object.keys(preferences).forEach((name) => {
    sendToAllWindows('set-preference', name, preferences[name]);
  });
};

module.exports = {
  getPreference,
  getPreferences,
  resetPreferences,
  setPreference,
};
