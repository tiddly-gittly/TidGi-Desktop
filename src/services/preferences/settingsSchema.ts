import type { IPreferences } from './interface';
import { PreferenceSections } from './interface';

/**
 * Extended JSON Schema property with TidGi-specific metadata for the searchable settings UI.
 * Compatible with rjsf RJSFSchema format.
 */
export interface ISettingPropertySchema {
  description?: string;
  /** rjsf-compatible enum values */
  enum?: string[];
  /** Human-readable labels for enum values (i18n keys) */
  enumNames?: string[];
  /** Inline editor should be displayed instead of toggling away from the list on search result. Set to false for settings that need complex dedicated UI (file picker, etc.) */
  inlineEditable?: boolean;
  /** Optional item schema for array types */
  items?: { enum?: string[]; type: string };
  type: 'array' | 'boolean' | 'number' | 'string';
  /** section this setting belongs to, for grouping in normal view and labeling in search view */
  'x-section': PreferenceSections;
  /** whether changing this setting requires app restart */
  'x-needsRestart'?: boolean;
  /** side effect to run after changing value */
  'x-sideEffect'?: 'realignActiveWorkspace' | 'reloadPage';
  /** i18n description key */
  'x-descriptionKey'?: string;
  /** i18n title key (required for search) */
  'x-titleKey': string;
  /** i18n namespace override (when not default translation namespace) */
  'x-ns'?: string;
}

export interface IPreferencesSchema {
  properties: Partial<Record<keyof IPreferences, ISettingPropertySchema>>;
  type: 'object';
}

/**
 * Flat JSON Schema for all IPreferences fields.
 * Each property carries x-section / x-titleKey / x-descriptionKey metadata
 * that drives both the grouped normal view and the flat search view.
 *
 * Complex sections (ExternalAPI, AIAgent, Search, System, etc.) that manage
 * services outside IPreferences are NOT included here; they are rendered by
 * their existing React components and hidden from search results.
 */
export const preferencesSchema: IPreferencesSchema = {
  type: 'object',
  properties: {
    // === General ===
    themeSource: {
      type: 'string',
      enum: ['system', 'light', 'dark'],
      enumNames: ['Preference.SystemDefaultTheme', 'Preference.LightTheme', 'Preference.DarkTheme'],
      'x-section': PreferenceSections.general,
      'x-titleKey': 'Preference.Theme',
      inlineEditable: true,
    },
    rememberLastPageVisited: {
      type: 'boolean',
      'x-section': PreferenceSections.general,
      'x-titleKey': 'Preference.RememberLastVisitState',
      inlineEditable: true,
    },
    sidebar: {
      type: 'boolean',
      'x-section': PreferenceSections.general,
      'x-titleKey': 'Preference.ShowSideBar',
      'x-descriptionKey': 'Preference.ShowSideBarDetail',
      'x-sideEffect': 'realignActiveWorkspace',
      inlineEditable: true,
    },
    showSideBarIcon: {
      type: 'boolean',
      'x-section': PreferenceSections.general,
      'x-titleKey': 'Preference.ShowSideBarIcon',
      'x-descriptionKey': 'Preference.HideSideBarIconDetail',
      inlineEditable: true,
    },
    showSideBarText: {
      type: 'boolean',
      'x-section': PreferenceSections.general,
      'x-titleKey': 'Preference.ShowSideBarText',
      inlineEditable: true,
    },
    alwaysOnTop: {
      type: 'boolean',
      'x-section': PreferenceSections.general,
      'x-titleKey': 'Preference.AlwaysOnTop',
      'x-descriptionKey': 'Preference.AlwaysOnTopDetail',
      inlineEditable: true,
    },
    runOnBackground: {
      type: 'boolean',
      'x-section': PreferenceSections.general,
      'x-titleKey': 'Preference.RunOnBackground',
      'x-descriptionKey': 'Preference.RunOnBackgroundDetail',
      inlineEditable: true,
    },
    swipeToNavigate: {
      type: 'boolean',
      'x-section': PreferenceSections.general,
      'x-titleKey': 'Preference.SwipeWithThreeFingersToNavigate',
      'x-descriptionKey': 'Preference.SwipeWithThreeFingersToNavigateDescription',
      inlineEditable: true,
    },
    titleBar: {
      type: 'boolean',
      'x-section': PreferenceSections.general,
      'x-titleKey': 'Preference.ShowTitleBar',
      'x-descriptionKey': 'Preference.ShowTitleBarDetail',
      'x-needsRestart': true,
      inlineEditable: true,
    },

    // === Sync ===
    syncBeforeShutdown: {
      type: 'boolean',
      'x-section': PreferenceSections.sync,
      'x-titleKey': 'Preference.SyncBeforeShutdown',
      'x-descriptionKey': 'Preference.SyncBeforeShutdownDescription',
      'x-needsRestart': true,
      inlineEditable: true,
    },
    syncOnlyWhenNoDraft: {
      type: 'boolean',
      'x-section': PreferenceSections.sync,
      'x-titleKey': 'Preference.SyncOnlyWhenNoDraft',
      'x-descriptionKey': 'Preference.SyncOnlyWhenNoDraftDescription',
      inlineEditable: true,
    },
    syncDebounceInterval: {
      type: 'number',
      'x-section': PreferenceSections.sync,
      'x-titleKey': 'Preference.SyncInterval',
      'x-descriptionKey': 'Preference.SyncIntervalDescription',
      'x-needsRestart': true,
      inlineEditable: true,
    },
    aiGenerateBackupTitle: {
      type: 'boolean',
      'x-section': PreferenceSections.sync,
      'x-titleKey': 'Preference.AIGenerateBackupTitle',
      'x-descriptionKey': 'Preference.AIGenerateBackupTitleDescription',
      inlineEditable: true,
    },
    aiGenerateBackupTitleTimeout: {
      type: 'number',
      'x-section': PreferenceSections.sync,
      'x-titleKey': 'Preference.AIGenerateBackupTitleTimeout',
      'x-descriptionKey': 'Preference.AIGenerateBackupTitleTimeoutDescription',
      inlineEditable: true,
    },

    // === TidGi Mini Window ===
    tidgiMiniWindow: {
      type: 'boolean',
      'x-section': PreferenceSections.tidgiMiniWindow,
      'x-titleKey': 'Preference.TidgiMiniWindow',
      'x-descriptionKey': 'Preference.TidgiMiniWindowTip',
      inlineEditable: true,
    },
    tidgiMiniWindowAlwaysOnTop: {
      type: 'boolean',
      'x-section': PreferenceSections.tidgiMiniWindow,
      'x-titleKey': 'Preference.TidgiMiniWindowAlwaysOnTop',
      'x-descriptionKey': 'Preference.TidgiMiniWindowAlwaysOnTopDetail',
      inlineEditable: true,
    },
    tidgiMiniWindowShowTitleBar: {
      type: 'boolean',
      'x-section': PreferenceSections.tidgiMiniWindow,
      'x-titleKey': 'Preference.TidgiMiniWindowShowTitleBar',
      'x-descriptionKey': 'Preference.TidgiMiniWindowShowTitleBarDetail',
      inlineEditable: true,
    },
    tidgiMiniWindowShowSidebar: {
      type: 'boolean',
      'x-section': PreferenceSections.tidgiMiniWindow,
      'x-titleKey': 'Preference.TidgiMiniWindowShowSidebar',
      'x-descriptionKey': 'Preference.TidgiMiniWindowShowSidebarTip',
      inlineEditable: true,
    },
    tidgiMiniWindowSyncWorkspaceWithMainWindow: {
      type: 'boolean',
      'x-section': PreferenceSections.tidgiMiniWindow,
      'x-titleKey': 'Preference.TidgiMiniWindowSyncWorkspaceWithMainWindow',
      'x-descriptionKey': 'Preference.TidgiMiniWindowSyncWorkspaceWithMainWindowDetail',
      inlineEditable: true,
    },

    // === Notifications ===
    unreadCountBadge: {
      type: 'boolean',
      'x-section': PreferenceSections.notifications,
      'x-titleKey': 'Preference.AttachToTaskbar',
      inlineEditable: true,
    },
    pauseNotificationsBySchedule: {
      type: 'boolean',
      'x-section': PreferenceSections.notifications,
      'x-titleKey': 'Preference.NotificationsDisableSchedule',
      inlineEditable: true,
    },
    pauseNotificationsMuteAudio: {
      type: 'boolean',
      'x-section': PreferenceSections.notifications,
      'x-titleKey': 'Preference.NotificationsMuteAudio',
      inlineEditable: true,
    },

    // === Languages ===
    language: {
      type: 'string',
      'x-section': PreferenceSections.languages,
      'x-titleKey': 'Preference.ChooseLanguage',
      // dynamic enum populated at runtime from supportedLanguagesMap
      inlineEditable: false,
    },
    spellcheck: {
      type: 'boolean',
      'x-section': PreferenceSections.languages,
      'x-titleKey': 'Preference.SpellCheck',
      'x-needsRestart': true,
      inlineEditable: true,
    },
    spellcheckLanguages: {
      type: 'array',
      items: { type: 'string' },
      'x-section': PreferenceSections.languages,
      'x-titleKey': 'Preference.SpellCheckLanguages',
      inlineEditable: false,
    },

    // === Downloads ===
    downloadPath: {
      type: 'string',
      'x-section': PreferenceSections.downloads,
      'x-titleKey': 'Preference.DownloadLocation',
      inlineEditable: false,
    },
    askForDownloadPath: {
      type: 'boolean',
      'x-section': PreferenceSections.downloads,
      'x-titleKey': 'Preference.AskDownloadLocation',
      inlineEditable: true,
    },

    // === Network ===
    disableAntiAntiLeech: {
      type: 'boolean',
      'x-section': PreferenceSections.network,
      'x-titleKey': 'Preference.DisableAntiAntiLeech',
      'x-descriptionKey': 'Preference.DisableAntiAntiLeechDetail',
      inlineEditable: true,
    },
    disableAntiAntiLeechForUrls: {
      type: 'array',
      items: { type: 'string' },
      'x-section': PreferenceSections.network,
      'x-titleKey': 'Preference.DisableAntiAntiLeechForUrls',
      'x-descriptionKey': 'Preference.DisableAntiAntiLeechForUrlsDetail',
      inlineEditable: false,
    },

    // === Privacy & Security ===
    shareWorkspaceBrowsingData: {
      type: 'boolean',
      'x-section': PreferenceSections.privacy,
      'x-titleKey': 'Preference.ShareBrowsingData',
      'x-needsRestart': true,
      inlineEditable: true,
    },
    ignoreCertificateErrors: {
      type: 'boolean',
      'x-section': PreferenceSections.privacy,
      'x-titleKey': 'Preference.IgnoreCertificateErrors',
      'x-descriptionKey': 'Preference.IgnoreCertificateErrorsDescription',
      'x-needsRestart': true,
      inlineEditable: true,
    },

    // === Performance ===
    hibernateUnusedWorkspacesAtLaunch: {
      type: 'boolean',
      'x-section': PreferenceSections.performance,
      'x-titleKey': 'Preference.HibernateAllUnusedWorkspaces',
      'x-descriptionKey': 'Preference.HibernateAllUnusedWorkspacesDescription',
      inlineEditable: true,
    },
    useHardwareAcceleration: {
      type: 'boolean',
      'x-section': PreferenceSections.performance,
      'x-titleKey': 'Preference.hardwareAcceleration',
      'x-needsRestart': true,
      inlineEditable: true,
    },

    // === Updates ===
    allowPrerelease: {
      type: 'boolean',
      'x-section': PreferenceSections.updates,
      'x-titleKey': 'Preference.ReceivePreReleaseUpdates',
      inlineEditable: true,
    },

    // === External API (handled by custom component, not inline) ===
    externalAPIDebug: {
      type: 'boolean',
      'x-section': PreferenceSections.externalAPI,
      'x-titleKey': 'Preference.ExternalAPIDebug',
      'x-ns': 'agent',
      inlineEditable: true,
    },
  },
};

/** Map from PreferenceSections to the section title i18n key (matches useSections.ts) */
export const sectionTitleKeys: Record<PreferenceSections, { ns?: string; key: string }> = {
  [PreferenceSections.wiki]: { key: 'Preference.TiddlyWiki' },
  [PreferenceSections.general]: { key: 'Preference.General' },
  [PreferenceSections.sync]: { key: 'Preference.Sync' },
  [PreferenceSections.tidgiMiniWindow]: { key: 'Menu.TidGiMiniWindow' },
  [PreferenceSections.externalAPI]: { key: 'Preference.ExternalAPI', ns: 'agent' },
  [PreferenceSections.aiAgent]: { key: 'Preference.AIAgent', ns: 'agent' },
  [PreferenceSections.search]: { key: 'Preference.Search' },
  [PreferenceSections.notifications]: { key: 'Preference.Notifications' },
  [PreferenceSections.system]: { key: 'Preference.System' },
  [PreferenceSections.network]: { key: 'Preference.Network' },
  [PreferenceSections.languages]: { key: 'Preference.Languages' },
  [PreferenceSections.developers]: { key: 'Preference.DeveloperTools' },
  [PreferenceSections.downloads]: { key: 'Preference.Downloads' },
  [PreferenceSections.privacy]: { key: 'Preference.PrivacyAndSecurity' },
  [PreferenceSections.performance]: { key: 'Preference.Performance' },
  [PreferenceSections.updates]: { key: 'Preference.Updates' },
  [PreferenceSections.friendLinks]: { key: 'Preference.FriendLinks' },
  [PreferenceSections.misc]: { key: 'Preference.Miscellaneous' },
};
