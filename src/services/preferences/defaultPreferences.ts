import { app } from 'electron';
import semver from 'semver';
import path from 'path';
import { IPreferences } from './interface';

export const defaultPreferences: IPreferences = {
  allowPrerelease: Boolean(semver.prerelease(app.getVersion())),
  askForDownloadPath: true,
  attachToMenubar: false,
  blockAds: false,
  // default Dark Reader settings from its Chrome extension
  darkReader: false,
  darkReaderBrightness: 100,
  darkReaderContrast: 100,
  darkReaderGrayscale: 0,
  darkReaderSepia: 0,
  // default Dark Reader settings from its Chrome extension
  downloadPath: getDefaultDownloadsPath(),
  hibernateUnusedWorkspacesAtLaunch: false,
  hideMenuBar: false,
  ignoreCertificateErrors: false,
  language: 'zh_CN',
  pauseNotifications: '',
  pauseNotificationsBySchedule: false,
  pauseNotificationsByScheduleFrom: getDefaultPauseNotificationsByScheduleFrom(),
  pauseNotificationsByScheduleTo: getDefaultPauseNotificationsByScheduleTo(),
  pauseNotificationsMuteAudio: false,
  rememberLastPageVisited: false,
  shareWorkspaceBrowsingData: false,
  sidebar: true,
  sidebarShortcutHints: true,
  spellcheck: true,
  spellcheckLanguages: ['en-US'],
  swipeToNavigate: true,
  syncDebounceInterval: 1000 * 60 * 30,
  themeSource: 'system' as 'system' | 'light' | 'dark',
  titleBar: true,
  unreadCountBadge: true,
  useHardwareAcceleration: true,
};

/** get path, note that if use this from the preload script, app will be undefined, so have to use remote.app here */
function getDefaultDownloadsPath(): string {
  return path.join(app.getPath('home'), 'Downloads');
}

function getDefaultPauseNotificationsByScheduleFrom(): string {
  const d = new Date();
  d.setHours(23);
  d.setMinutes(0);
  return d.toString();
}

function getDefaultPauseNotificationsByScheduleTo(): string {
  const d = new Date();
  d.setHours(7);
  d.setMinutes(0);
  return d.toString();
}
