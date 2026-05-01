import { DEFAULT_DOWNLOADS_PATH } from '@/constants/appPaths';
import { isMac } from '@/helpers/system';
import { app } from 'electron';
import semver from 'semver';
import type { IPreferences } from './interface';

// Allow E2E tests to inject analytics configuration via environment variables
function getAnalyticsEnvironmentOverrides(): { analyticsApiKey: string; analyticsEnabled: boolean; analyticsHost: string; analyticsSiteId: string } {
  const analyticsHost = process.env.TIDGI_ANALYTICS_HOST ?? '';
  if (analyticsHost) {
    return {
      analyticsApiKey: process.env.TIDGI_ANALYTICS_API_KEY ?? 'test-api-key',
      analyticsEnabled: true,
      analyticsHost,
      analyticsSiteId: process.env.TIDGI_ANALYTICS_SITE_ID ?? 'test-site',
    };
  }
  // site_id is safe to embed publicly — Rybbit's /api/track is a public endpoint
  // that only needs site_id (same as the data-site-id in <script> tags on websites).
  // API keys are only for reading data via the dashboard API, not for writing events.
  return { analyticsApiKey: '', analyticsEnabled: true, analyticsHost: 'https://analytics.tidgi.fun', analyticsSiteId: '189dd97a8d37' };
}

const analyticsEnvironment = getAnalyticsEnvironmentOverrides();

export const defaultPreferences: IPreferences = {
  allowPrerelease: Boolean(semver.prerelease(app.getVersion())),
  alwaysOnTop: false,
  analyticsApiKey: analyticsEnvironment.analyticsApiKey,
  analyticsEnabled: analyticsEnvironment.analyticsEnabled,
  analyticsHost: analyticsEnvironment.analyticsHost,
  analyticsSiteId: analyticsEnvironment.analyticsSiteId,
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
  // macOS convention: keep app running after all windows close (user re-opens via dock).
  // Windows/Linux convention: exit when the last window is closed.
  runOnBackground: isMac,
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
  aiGenerateBackupTitle: true,
  aiGenerateBackupTitleTimeout: 1500,
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
