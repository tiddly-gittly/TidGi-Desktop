const path = require('path');
const settings = require('electron-settings');
const { app, nativeTheme, ipcMain } = require('electron');

const sendToAllWindows = require('./send-to-all-windows');

// scope
const v = '2018.2';

const getDefaultDownloadsPath = () => path.join(app.getPath('home'), 'Downloads');

const getDefaultPauseNotificationsByScheduleFrom = () => {
  const d = new Date();
  d.setHours(23);
  d.setMinutes(0);
  return d.toString();
};

const getDefaultPauseNotificationsByScheduleTo = () => {
  const d = new Date();
  d.setHours(7);
  d.setMinutes(0);
  return d.toString();
};

const defaultPreferences = {
  allowPrerelease: false,
  askForDownloadPath: true,
  attachToMenubar: false,
  blockAds: false,
  cssCodeInjection: null,
  customUserAgent: null,
  downloadPath: getDefaultDownloadsPath(),
  hibernateUnusedWorkspacesAtLaunch: false,
  hideMenuBar: false,
  jsCodeInjection: null,
  navigationBar: false,
  pauseNotifications: null,
  pauseNotificationsBySchedule: false,
  pauseNotificationsByScheduleFrom: getDefaultPauseNotificationsByScheduleFrom(),
  pauseNotificationsByScheduleTo: getDefaultPauseNotificationsByScheduleTo(),
  pauseNotificationsMuteAudio: false,
  proxyBypassRules: '',
  proxyPacScript: '',
  proxyRules: '',
  proxyType: 'none',
  registered: false,
  rememberLastPageVisited: false,
  shareWorkspaceBrowsingData: false,
  sidebar: true,
  spellcheck: true,
  spellcheckLanguages: ['en-US'],
  swipeToNavigate: true,
  themeSource: 'system',
  titleBar: false,
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

  if (name.startsWith('pauseNotifications')) {
    ipcMain.emit('request-update-pause-notifications-info');
  }

  if (name === 'themeSource') {
    nativeTheme.themeSource = value;
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
