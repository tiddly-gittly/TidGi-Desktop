import { DEFAULT_DOWNLOADS_PATH } from '@/constants/appPaths';
import { app } from 'electron';
import semver from 'semver';
import type { IPreferences } from './interface';

export const defaultPreferences: IPreferences = {
  allowPrerelease: Boolean(semver.prerelease(app.getVersion())),
  alwaysOnTop: false,
  askForDownloadPath: true,
  disableAntiAntiLeech: false,
  disableAntiAntiLeechForUrls: [],
  downloadPath: DEFAULT_DOWNLOADS_PATH,
  externalAPIDebug: false,
  hibernateUnusedWorkspacesAtLaunch: false,
  hideMenuBar: false,
  ignoreCertificateErrors: false,
  keyboardShortcuts: {},
  language: 'zh-Hans',
  pauseNotifications: '',
  pauseNotificationsBySchedule: false,
  pauseNotificationsByScheduleFrom: getDefaultPauseNotificationsByScheduleFrom(),
  pauseNotificationsByScheduleTo: getDefaultPauseNotificationsByScheduleTo(),
  pauseNotificationsMuteAudio: false,
  rememberLastPageVisited: true,
  runOnBackground: true,
  shareWorkspaceBrowsingData: false,
  showSideBarIcon: true,
  showSideBarText: true,
  sidebar: true,
  spellcheck: true,
  spellcheckLanguages: ['en-US'],
  swipeToNavigate: true,
  syncBeforeShutdown: false,
  syncDebounceInterval: 1000 * 60 * 30,
  syncOnlyWhenNoDraft: true,
  themeSource: 'system' as 'system' | 'light' | 'dark',
  tidgiMiniWindow: false,
  tidgiMiniWindowAlwaysOnTop: false,
  tidgiMiniWindowFixedWorkspaceId: '',
  tidgiMiniWindowShowSidebar: false,
  tidgiMiniWindowShowTitleBar: true,
  tidgiMiniWindowSyncWorkspaceWithMainWindow: true,
  titleBar: true,
  unreadCountBadge: true,
  useHardwareAcceleration: true,
};

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
