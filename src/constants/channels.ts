/** Channels controls main thread */
export enum MainChannel {
  /**
   * Common initialization procedural of electron app booting finished, we can do more domain specific jobs
   */
  commonInitFinished = 'common-init-finished',
}

export enum AuthenticationChannel {
  name = 'AuthenticationChannel',
}
export enum ContextChannel {
  name = 'ContextChannel',
}
export enum GitChannel {
  name = 'GitChannel',
}
export enum MenuChannel {
  name = 'MenuChannel',
}
export enum NativeChannel {
  name = 'NativeChannel',
}
export enum NotificationChannel {
  name = 'NotificationChannel',
}
export enum SystemPreferenceChannel {
  name = 'SystemPreferenceChannel',
}
export enum UpdaterChannel {
  name = 'UpdaterChannel',
}
export enum ViewChannel {
  name = 'ViewChannel',
}
export enum WikiChannel {
  name = 'WikiChannel',
}
export enum WikiGitWorkspaceChannel {
  name = 'WikiGitWorkspaceChannel',
}
export enum WorkspaceChannel {
  name = 'WorkspaceChannel',
}
export enum WorkspaceViewChannel {
  name = 'WorkspaceViewChannel',
}

export enum PreferenceChannel {
  name = 'PreferenceChannel',
  update = 'update',
  requestResetPreferences = 'request-reset-preferences',
  requestShowRequireRestartDialog = 'request-show-require-restart-dialog',
  getPreference = 'get-preference',
  getPreferences = 'get-preferences',
  requestSetPreference = 'request-set-preference',
  requestClearBrowsingData = 'request-clear-browsing-data',
}

export enum WindowChannel {
  name = 'WindowChannel',
  requestShowRequireRestartDialog = 'request-show-require-restart-dialog',
  requestShowPreferencesWindow = 'request-show-preferences-window',
  requestShowAboutWindow = 'request-show-about-window',
  requestShowCustomUserAgentWindow = 'request-show-custom-user-agent-window',
  requestShowCodeInjectionWindow = 'request-show-code-injection-window',
  requestShowAddWorkspaceWindow = 'request-show-add-workspace-window',
  requestShowEditWorkspaceWindow = 'request-show-edit-workspace-window',
  requestShowNotificationsWindow = 'request-show-notifications-window',
  requestShowProxyWindow = 'request-show-proxy-window',
  requestShowSpellcheckLanguagesWindow = 'request-show-spellcheck-languages-window',
}

export enum ThemeChannel {
  name = 'ThemeChannel',
  nativeThemeUpdated = 'native-theme-updated',
}

export enum I18NChannels {
  name = 'I18NChannels',
  readFileRequest = 'ReadFile-Request',
  writeFileRequest = 'WriteFile-Request',
  readFileResponse = 'ReadFile-Response',
  writeFileResponse = 'WriteFile-Response',
  changeLanguageRequest = 'ChangeLanguage-Request',
}

export enum MetaDataChannel {
  name = 'MetaDataChannel',
  getViewMetaData = 'getViewMetaData',
}

export type Channels = PreferenceChannel | WindowChannel | ThemeChannel | I18NChannels | MetaDataChannel;
