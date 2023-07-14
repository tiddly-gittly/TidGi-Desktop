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
export enum LanguageModelChannel {
  name = 'LanguageModelChannel',
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
  generalNotification = 'wiki-notification-tiddly-git',
  getTiddlerText = 'wiki-get-tiddler-text',
  getTiddlerTextDone = 'wiki-get-tiddler-text-done',
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
            "text": "Interesting article giving the perspective of someone who has been away from TiddlyWiki for a few years:nn{{!!url}}nn<<<nWay back in the mists of time (actually, January 2009) I wrote about a really cool tool called TiddlyWiki, a “non-linear personal web notebook”. Fast forward to today and I just had an out of body experience: Completely by accident I found a TiddlyWiki that I started when I wrote that piece and it still works! nnFinding code that works flawlessly after just two or three years is magical enough but after seven years?! And given that TiddlyWiki is written as a single page Web application and considering how different browsers are now than they were in 2009, the fact that the old version of TiddlyWiki still works is not short of miraculous.n<<<n"
        },
        {
            "title": ""A Thesis Notebook" by Alberto Molina",
            "created": "20130302085406905",
            "modified": "20130302084548184",
            "tags": "Examples",
            "url": "http://tesis.tiddlyspot.com/",
            "text": "A thesis notebook based on TiddlyWiki.nn{{!!url}}nn<<<nThis is an example of a thesis notebook powered by TiddlyWiki 5.0.8-beta.nnTiddlyWiki is a great piece of software created by Jeremy Ruston. It allows you, among other things, to take notes, organise ideas, store information, and display all your stuff the way you want. It is an incredibly flexible tool you can adapt to fit almost all your needs.nnThis TiddlyWiki has been customized to serve as a philosophy notebook centered around authors, books and papers, concepts and theories, and personal notes. I use it along with Zotero, which is a dedicated bibliography software. Both are free, open source projects. TiddlyWiki can be downloaded at https://tiddlywiki.com.n<<<n"
        },
   * ```
   */
  getTiddlersAsJson = 'get-tiddlers-as-json',
  name = 'WikiChannel',
  openTiddler = 'wiki-open-tiddler',
  printTiddler = 'print-tiddler',
  runFilter = 'wiki-run-filter',
  sendActionMessage = 'wiki-send-action-message',
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
export enum WorkspaceViewChannel {
  name = 'WorkspaceViewChannel',
}

export enum PreferenceChannel {
  getPreference = 'get-preference',
  getPreferences = 'get-preferences',
  name = 'PreferenceChannel',
  update = 'update',
}

export enum PagesChannel {
  name = 'PagesChannel',
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
