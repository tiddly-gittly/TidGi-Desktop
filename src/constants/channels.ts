/** Channels controls main thread */
export enum MainChannel {
  /**
   * Common initialization procedural of electron app booting finished, we can do more domain specific jobs
   */
  commonInitFinished = 'common-init-finished',
  windowAllClosed = 'window-all-closed',
}

export enum AuthenticationChannel {
  name = 'AuthenticationChannel',
  update = 'update',
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
  shouldPauseNotificationsChanged = 'should-pause-notifications-changed',
}
export enum SystemPreferenceChannel {
  name = 'SystemPreferenceChannel',
  setSystemPreference = 'set-system-preference',
}
export enum UpdaterChannel {
  name = 'UpdaterChannel',
  updateUpdater = 'update-updater',
}
export enum ViewChannel {
  name = 'ViewChannel',
  onlineStatusChanged = 'online-status-changed',
  updateFindInPageMatches = 'update-find-in-page-matches',
}
export enum WikiChannel {
  name = 'WikiChannel',
}
export enum WikiGitWorkspaceChannel {
  name = 'WikiGitWorkspaceChannel',
}
export enum WorkspaceChannel {
  name = 'WorkspaceChannel',
  focusWorkspace = 'focus-workspace',
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
  updateAddress = 'update-address',
  updateTitle = 'update-title',
  updateCanGoBack = 'update-can-go-back',
  updateCanGoForward = 'update-can-go-forward',
  openFindInPage = 'open-find-in-page',
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

export type Channels =
  | MainChannel
  | AuthenticationChannel
  | ContextChannel
  | GitChannel
  | MenuChannel
  | NativeChannel
  | NotificationChannel
  | SystemPreferenceChannel
  | UpdaterChannel
  | ViewChannel
  | WikiChannel
  | WikiGitWorkspaceChannel
  | WorkspaceChannel
  | WorkspaceViewChannel
  | PreferenceChannel
  | WindowChannel
  | ThemeChannel
  | I18NChannels
  | MetaDataChannel;
