import { DEFAULT_DOWNLOADS_PATH } from '@/constants/appPaths';
import { LanguageModelRunner } from '@services/languageModel/interface';
import { app } from 'electron';
import semver from 'semver';
import { IPreferences } from './interface';

export const defaultPreferences: IPreferences = {
  allowPrerelease: Boolean(semver.prerelease(app.getVersion())),
  alwaysOnTop: false,
  askForDownloadPath: true,
  attachToMenubar: false,
  downloadPath: DEFAULT_DOWNLOADS_PATH,
  hibernateUnusedWorkspacesAtLaunch: false,
  hideMenuBar: false,
  showSideBarIcon: true,
  ignoreCertificateErrors: false,
  language: 'zh_CN',
  languageModel: {
    defaultModel: {
      [LanguageModelRunner.llmRs]: 'llama.bin',
      [LanguageModelRunner.llamaCpp]: 'llama.bin',
      [LanguageModelRunner.rwkvCpp]: 'rwkv.bin',
    },
    timeoutDuration: 1000 * 60,
  },
  menuBarAlwaysOnTop: false,
  pauseNotifications: '',
  pauseNotificationsBySchedule: false,
  pauseNotificationsByScheduleFrom: getDefaultPauseNotificationsByScheduleFrom(),
  pauseNotificationsByScheduleTo: getDefaultPauseNotificationsByScheduleTo(),
  pauseNotificationsMuteAudio: false,
  rememberLastPageVisited: true,
  shareWorkspaceBrowsingData: false,
  sidebar: true,
  showSideBarText: true,
  spellcheck: true,
  spellcheckLanguages: ['en-US'],
  swipeToNavigate: true,
  syncBeforeShutdown: false,
  syncOnlyWhenNoDraft: true,
  syncDebounceInterval: 1000 * 60 * 30,
  themeSource: 'system' as 'system' | 'light' | 'dark',
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
