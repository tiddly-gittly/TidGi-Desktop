import type { HunspellLanguages } from '@/constants/hunspellLanguages';
import { z } from 'zod';

/**
 * Canonical Zod schema for all user-configurable preferences.
 * `IPreferences` is derived from this via `z.infer` — this file is the single
 * source of truth for the shape and runtime validation of preference data.
 */
export const zodPreferencesSchema = z.object({
  allowPrerelease: z.boolean(),
  alwaysOnTop: z.boolean(),
  askForDownloadPath: z.boolean(),
  disableAntiAntiLeech: z.boolean(),
  disableAntiAntiLeechForUrls: z.array(z.string()),
  downloadPath: z.string(),
  externalAPIDebug: z.boolean(),
  hibernateUnusedWorkspacesAtLaunch: z.boolean(),
  hideMenuBar: z.boolean(),
  ignoreCertificateErrors: z.boolean(),
  /** Keyboard shortcut map: `serviceIdentifier.methodName` -> shortcut string */
  keyboardShortcuts: z.record(z.string(), z.string()),
  language: z.string(),
  pauseNotifications: z.string().optional(),
  pauseNotificationsBySchedule: z.boolean(),
  pauseNotificationsByScheduleFrom: z.string(),
  pauseNotificationsByScheduleTo: z.string(),
  pauseNotificationsMuteAudio: z.boolean(),
  rememberLastPageVisited: z.boolean(),
  runOnBackground: z.boolean(),
  shareWorkspaceBrowsingData: z.boolean(),
  showSideBarIcon: z.boolean(),
  showSideBarText: z.boolean(),
  /** Show sidebar on main window */
  sidebar: z.boolean(),
  /** Show sidebar on TidGi mini window */
  tidgiMiniWindowShowSidebar: z.boolean(),
  spellcheck: z.boolean(),
  spellcheckLanguages: z.array(z.string() as z.ZodType<HunspellLanguages>),
  swipeToNavigate: z.boolean(),
  tidgiMiniWindow: z.boolean(),
  tidgiMiniWindowAlwaysOnTop: z.boolean(),
  /** Fixed workspace ID for mini window when not syncing with main window */
  tidgiMiniWindowFixedWorkspaceId: z.string().optional(),
  tidgiMiniWindowShowTitleBar: z.boolean(),
  /** Whether mini window should follow the active workspace of the main window */
  tidgiMiniWindowSyncWorkspaceWithMainWindow: z.boolean(),
  syncBeforeShutdown: z.boolean(),
  syncDebounceInterval: z.number(),
  /** Only sync when there are no draft tiddlers (prevents drafts appearing in blogs) */
  syncOnlyWhenNoDraft: z.boolean(),
  aiGenerateBackupTitle: z.boolean(),
  aiGenerateBackupTitleTimeout: z.number(),
  themeSource: z.enum(['system', 'light', 'dark']),
  titleBar: z.boolean(),
  unreadCountBadge: z.boolean(),
  useHardwareAcceleration: z.boolean(),
});

export type IPreferences = z.infer<typeof zodPreferencesSchema>;
