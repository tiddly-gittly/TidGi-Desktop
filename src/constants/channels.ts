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
export enum DatabaseChannel {
  getTiddlers = 'get-tiddlers',
  insertTiddlers = 'insert-tiddlers',
  name = 'DatabaseChannel',
  searchTiddlers = 'search-tiddlers',
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
  /** used to show wiki creation messages in the TidGi UI for user to read */
  createProgress = 'wiki-create-progress',
  deleteTiddler = 'wiki-delete-tiddler',
  dispatchEvent = 'wiki-send-action-message',
  generalNotification = 'wiki-notification-tiddly-git',
  getTiddler = 'wiki-get-tiddler',
  getTiddlerText = 'wiki-get-tiddler-text',
  /**
   * `$tw.wiki.getTiddlersAsJson('[all[]]')`
   *
   * result example:
   * ```js
   * `[
        {
            "title": ""A free, open source wiki revisited" by Mark Gibbs, NetworkWorld",
            "created": "20160204225047445",
            "modified": "20160204225307847",
            "tags": "Articles",
            "type": "text/vnd.tiddlywiki",
            "url": "http://www.networkworld.com/article/3028098/open-source-tools/tiddlywiki-a-free-open-source-wiki-revisited.html",
            "text": "Interesting article"
        },
   * ```
   */
  getTiddlersAsJson = 'get-tiddlers-as-json',
  invokeActionsByTag = 'wiki-invoke-actions-by-tag',
  name = 'WikiChannel',
  openTiddler = 'wiki-open-tiddler',
  renderTiddlerOuterHTML = 'render-tiddler',
  /**
   * Render wiki text to html
   */
  renderWikiText = 'render-wiki-text',
  runFilter = 'wiki-run-filter',
  setState = 'wiki-set-state',
  setTiddlerText = 'wiki-set-tiddler-text',
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
export enum WorkspaceGroupChannel {
  name = 'WorkspaceGroupChannel',
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
  pushViewMetaData = 'pushViewMetaData',
}

export enum SyncChannel {
  name = 'SyncChannel',
}

export enum AgentChannel {
  definition = 'AgentDefinitionChannel',
  instance = 'AgentInstanceChannel',
  browser = 'AgentBrowserChannel',
}

export enum ExternalAPIChannel {
  name = 'ExternalAPIChannel',
}

export enum WikiEmbeddingChannel {
  name = 'WikiEmbeddingChannel',
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
  | WorkspaceGroupChannel
  | WorkspaceViewChannel
  | DatabaseChannel
  | PreferenceChannel
  | WindowChannel
  | ThemeChannel
  | I18NChannels
  | MetaDataChannel
  | SyncChannel
  | AgentChannel
  | WikiEmbeddingChannel;
