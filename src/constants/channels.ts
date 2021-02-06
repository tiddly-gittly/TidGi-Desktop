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
  getBaseName = 'get-basename',
  getDirectoryName = 'get-dirname',
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
  onlineStatusChanged = 'online-status-changed',
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
  getPreference = 'get-preference',
  getPreferences = 'get-preferences',
}

export enum WindowChannel {
  name = 'WindowChannel',
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
