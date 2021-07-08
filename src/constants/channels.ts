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
  addTiddler = 'wiki-add-tiddler',
  addTiddlerDone = 'wiki-add-tiddler-done',
  getTiddlerText = 'wiki-get-tiddler-text',
  getTiddlerTextDone = 'wiki-get-tiddler-text-done',
  /** show message inside tiddlywiki to show git sync progress */
  syncProgress = 'wiki-sync-progress',
  /** used to show wiki creation messages in the TiddlyGit UI for user to read */
  createProgress = 'wiki-create-progress',
  openTiddler = 'wiki-open-tiddler',
  sendActionMessage = 'wiki-send-action-message',
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
  updateCanGoBack = 'update-can-go-back',
  updateCanGoForward = 'update-can-go-forward',
  openFindInPage = 'open-find-in-page',
  closeFindInPage = 'close-find-in-page',
}

export enum ThemeChannel {
  name = 'ThemeChannel',
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
  browserViewMetaData = 'browserViewMetaData',
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
