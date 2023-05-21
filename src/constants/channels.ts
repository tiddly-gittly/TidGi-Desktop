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
  showElectronMessageBoxSync = 'show-electron-message-box-sync',
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
  addTiddler = 'wiki-add-tiddler',
  addTiddlerDone = 'wiki-add-tiddler-done',
  /** used to show wiki creation messages in the TidGi UI for user to read */
  createProgress = 'wiki-create-progress',
  generalNotification = 'wiki-notification-tiddly-git',
  getTiddlerText = 'wiki-get-tiddler-text',
  getTiddlerTextDone = 'wiki-get-tiddler-text-done',
  name = 'WikiChannel',
  openTiddler = 'wiki-open-tiddler',
  printTiddler = 'print-tiddler',
  runFilter = 'wiki-run-filter',
  runFilterDone = 'wiki-run-filter-done',
  sendActionMessage = 'wiki-send-action-message',
  setState = 'wiki-set-state',
  setTiddlerText = 'wiki-set-tiddler-text',
  setTiddlerTextDone = 'wiki-set-tiddler-text-done',
  /** show message inside tiddlywiki to show git sync progress */
  syncProgress = 'wiki-sync-progress',
}
export enum WikiGitWorkspaceChannel {
  name = 'WikiGitWorkspaceChannel',
}
export enum WorkspaceChannel {
  focusWorkspace = 'focus-workspace',
  name = 'WorkspaceChannel',
}
export enum WorkspaceViewChannel {
  name = 'WorkspaceViewChannel',
}

export enum PreferenceChannel {
  getPreference = 'get-preference',
  getPreferences = 'get-preferences',
  name = 'PreferenceChannel',
  update = 'update',
}

export enum WindowChannel {
  closeFindInPage = 'close-find-in-page',
  name = 'WindowChannel',
  openFindInPage = 'open-find-in-page',
  // TODO: add back the listener as https://github.com/webcatalog/neutron/blob/52a35f103761d82ae5a35e5f90fc39024830bc63/src/listeners/index.js#L80
  updateCanGoBack = 'update-can-go-back',
  updateCanGoForward = 'update-can-go-forward',
}

export enum ThemeChannel {
  name = 'ThemeChannel',
}

export enum I18NChannels {
  changeLanguageRequest = 'ChangeLanguage-Request',
  name = 'I18NChannels',
  readFileRequest = 'ReadFile-Request',
  readFileResponse = 'ReadFile-Response',
  writeFileRequest = 'WriteFile-Request',
  writeFileResponse = 'WriteFile-Response',
}

export enum MetaDataChannel {
  browserViewMetaData = 'browserViewMetaData',
  getViewMetaData = 'getViewMetaData',
  name = 'MetaDataChannel',
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
