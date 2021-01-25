

export const requestOpen = (uri: string, isDirectory: boolean) => ipcRenderer.invoke('request-open', uri, !!isDirectory);
export const requestShowMessageBox = (message: string, type: string) => ipcRenderer.invoke('request-show-message-box', message, type);
export const requestLoadUrl = (url: string, id: string) => ipcRenderer.invoke('request-load-url', url, id);

export const requestGoHome = () => ipcRenderer.invoke('request-go-home');
export const requestGoBack = () => ipcRenderer.invoke('request-go-back');
export const requestGoForward = () => ipcRenderer.invoke('request-go-forward');
export const requestReload = () => ipcRenderer.invoke('request-reload');

export const requestQuit = () => ipcRenderer.invoke('request-quit');
export const requestCheckForUpdates = (isSilent: boolean) => ipcRenderer.invoke('request-check-for-updates', isSilent);

export const requestShowAboutWindow = () => ipcRenderer.invoke('request-show-about-window');
export const requestShowAddWorkspaceWindow = () => ipcRenderer.invoke('request-show-add-workspace-window');
export const requestShowCodeInjectionWindow = (type: string) => ipcRenderer.invoke('request-show-code-injection-window', type);
export const requestShowCustomUserAgentWindow = () => ipcRenderer.invoke('request-show-custom-user-agent-window');
export const requestShowEditWorkspaceWindow = (id: string) => ipcRenderer.invoke('request-show-edit-workspace-window', id);
export const requestShowNotificationsWindow = () => ipcRenderer.invoke('request-show-notifications-window');
export const requestShowPreferencesWindow = (scrollTo: string) => ipcRenderer.invoke('request-show-preferences-window', scrollTo);
export const requestShowProxyWindow = () => ipcRenderer.invoke('request-show-proxy-window');
export const requestShowSpellcheckLanguagesWindow = () => ipcRenderer.invoke('request-show-spellcheck-languages-window');

// Notifications
export const requestShowNotification = (options: { title: string; body: string }) => ipcRenderer.invoke('request-show-notification', options);
export const requestUpdatePauseNotificationsInfo = () => ipcRenderer.invoke('request-update-pause-notifications-info');
export const getPauseNotificationsInfo = () => ipcRenderer.invokeSync('get-pause-notifications-info');

// Preferences
// eslint-disable-next-line no-use-before-define
export type JsonValue = string | number | boolean | null | JsonArray | JsonObject | void;
export interface JsonObject {
  [x: string]: JsonValue;
}
interface JsonArray extends Array<JsonValue> {} // tslint:disable-line no-empty-interface
export function getPreference<T = JsonValue>(name: string): T {
  return ipcRenderer.invokeSync('get-preference', name);
}
export const getPreferences = () => ipcRenderer.invokeSync('get-preferences');
export const requestSetPreference = (name: string, value: JsonValue) => ipcRenderer.invoke('request-set-preference', name, value);
export const requestResetPreferences = () => ipcRenderer.invoke('request-reset-preferences');
export const requestShowRequireRestartDialog = () => ipcRenderer.invoke('request-show-require-restart-dialog');

// System Preferences
export const getSystemPreference = (name: string): JsonValue => ipcRenderer.invokeSync('get-system-preference', name);
export const getSystemPreferences = (): JsonObject => ipcRenderer.invokeSync('get-system-preferences');
export const requestSetSystemPreference = (name: string, value: JsonValue) => ipcRenderer.invoke('request-set-system-preference', name, value);

// Workspace
export const countWorkspace = () => ipcRenderer.invokeSync('count-workspace');
export const getWorkspace = (id: string) => ipcRenderer.invokeSync('get-workspace', id);
export const getWorkspaces = () => ipcRenderer.invokeSync('get-workspaces');
export const requestClearBrowsingData = () => ipcRenderer.invoke('request-clear-browsing-data');
export const requestCreateWorkspace = (
  name: string,
  isSubWiki: boolean,
  mainWikiToLink: string,
  port: number,
  homeUrl: string,
  gitUrl: string,
  picture: string,
  transparentBackground: boolean,
  tagName: string,
) => ipcRenderer.invoke('request-create-workspace', name, isSubWiki, mainWikiToLink, port, homeUrl, gitUrl, picture, transparentBackground, tagName);

export const requestHibernateWorkspace = (id: string) => ipcRenderer.invoke('request-hibernate-workspace', id);
export const requestOpenUrlInWorkspace = (url: string, id: string) => ipcRenderer.invoke('request-open-url-in-workspace', url, id);
export const requestRealignActiveWorkspace = () => ipcRenderer.invoke('request-realign-active-workspace');
export const requestRemoveWorkspace = (id: string) => ipcRenderer.invoke('request-remove-workspace', id);
export const requestRemoveWorkspacePicture = (id: string) => ipcRenderer.invoke('request-remove-workspace-picture', id);
export const requestSetActiveWorkspace = (id: string) => ipcRenderer.invoke('request-set-active-workspace', id);
export const requestGetActiveWorkspace = () => ipcRenderer.invokeSync('request-get-active-workspace');
export const requestSetWorkspace = (id: string, options: any) => ipcRenderer.invoke('request-set-workspace', id, options);
export const requestSetWorkspaces = (workspaces: any) => ipcRenderer.invoke('request-set-workspaces', workspaces);
export const requestSetWorkspacePicture = (id: string, picturePath: string) => ipcRenderer.invoke('request-set-workspace-picture', id, picturePath);
export const requestWakeUpWorkspace = (id: string) => ipcRenderer.invoke('request-wake-up-workspace', id);

// eslint-disable-next-line sonarjs/no-duplicate-string
export const getIconPath = () => ipcRenderer.invokeSync('get-constant', 'ICON_PATH');
export const getReactPath = () => ipcRenderer.invokeSync('get-constant', 'REACT_PATH');
export const getDesktopPath = () => ipcRenderer.invokeSync('get-constant', 'DESKTOP_PATH');
export const getLogFolderPath = () => ipcRenderer.invokeSync('get-constant', 'LOG_FOLDER');
export const getIsDevelopment = () => ipcRenderer.invokeSync('get-constant', 'isDev');

// call path
export const getBaseName = (pathString: string): string => ipcRenderer.invokeSync('get-basename', pathString);
export const getDirectoryName = (pathString: string): string => ipcRenderer.invokeSync('get-dirname', pathString);

// Workspace Meta
export const getWorkspaceMeta = (id: string) => ipcRenderer.invokeSync('get-workspace-meta', id);
export const getWorkspaceMetas = () => ipcRenderer.invokeSync('get-workspace-metas');

// Find In Page
export const requestFindInPage = (text: string, forward: boolean) => ipcRenderer.invoke('request-find-in-page', text, !!forward);
export const requestStopFindInPage = (close: boolean) => ipcRenderer.invoke('request-stop-find-in-page', !!close);

// Auth
export const requestValidateAuthIdentity = (windowId: string, username: string, password: string) =>
  ipcRenderer.invoke('request-validate-auth-identity', windowId, username, password);

// Native Theme
export const getShouldUseDarkColors = () => ipcRenderer.invokeSync('get-should-use-dark-colors');

// Online Status
export const signalOnlineStatusChanged = (online: boolean) => ipcRenderer.invoke('online-status-changed', online);
