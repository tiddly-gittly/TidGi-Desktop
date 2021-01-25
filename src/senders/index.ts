import { ipcRenderer } from 'electron';

export const requestOpen = async (uri: string, isDirectory: boolean): Promise<void> => {
  await ipcRenderer.invoke('request-open', uri, !!isDirectory);
};
export const requestQuit = async (): Promise<void> => {
  await ipcRenderer.invoke('request-quit');
};

// Native Theme
export const getShouldUseDarkColors = async (): Promise<void> => {
  await ipcRenderer.invoke('get-should-use-dark-colors');
};

export const requestCheckForUpdates = async (isSilent: boolean) => await ipcRenderer.invoke('request-check-for-updates', isSilent);

export const requestShowAboutWindow = async () => await ipcRenderer.invoke('request-show-about-window');
export const requestShowAddWorkspaceWindow = async () => await ipcRenderer.invoke('request-show-add-workspace-window');
export const requestShowCodeInjectionWindow = async (type: string) => await ipcRenderer.invoke('request-show-code-injection-window', type);
export const requestShowCustomUserAgentWindow = async () => await ipcRenderer.invoke('request-show-custom-user-agent-window');
export const requestShowEditWorkspaceWindow = async (id: string) => await ipcRenderer.invoke('request-show-edit-workspace-window', id);
export const requestShowNotificationsWindow = async () => await ipcRenderer.invoke('request-show-notifications-window');
export const requestShowPreferencesWindow = async (scrollTo: string) => await ipcRenderer.invoke('request-show-preferences-window', scrollTo);
export const requestShowProxyWindow = async () => await ipcRenderer.invoke('request-show-proxy-window');
export const requestShowSpellcheckLanguagesWindow = async () => await ipcRenderer.invoke('request-show-spellcheck-languages-window');

// Notifications
export const requestShowNotification = async (options: { title: string; body: string }) => await ipcRenderer.invoke('request-show-notification', options);
export const requestUpdatePauseNotificationsInfo = async () => await ipcRenderer.invoke('request-update-pause-notifications-info');
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
export const requestSetPreference = async (name: string, value: JsonValue) => await ipcRenderer.invoke('request-set-preference', name, value);
export const requestResetPreferences = async () => await ipcRenderer.invoke('request-reset-preferences');
export const requestShowRequireRestartDialog = async () => await ipcRenderer.invoke('request-show-require-restart-dialog');

// System Preferences
export const getSystemPreference = (name: string): JsonValue => ipcRenderer.invokeSync('get-system-preference', name);
export const getSystemPreferences = (): JsonObject => ipcRenderer.invokeSync('get-system-preferences');
export const requestSetSystemPreference = async (name: string, value: JsonValue) => await ipcRenderer.invoke('request-set-system-preference', name, value);

// Workspace
export const countWorkspace = () => ipcRenderer.invokeSync('count-workspace');
export const getWorkspace = (id: string) => ipcRenderer.invokeSync('get-workspace', id);
export const getWorkspaces = () => ipcRenderer.invokeSync('get-workspaces');
export const requestClearBrowsingData = async () => await ipcRenderer.invoke('request-clear-browsing-data');
export const requestCreateWorkspace = async (
  name: string,
  isSubWiki: boolean,
  mainWikiToLink: string,
  port: number,
  homeUrl: string,
  gitUrl: string,
  picture: string,
  transparentBackground: boolean,
  tagName: string,
) => await ipcRenderer.invoke('request-create-workspace', name, isSubWiki, mainWikiToLink, port, homeUrl, gitUrl, picture, transparentBackground, tagName);

export const requestHibernateWorkspace = async (id: string) => await ipcRenderer.invoke('request-hibernate-workspace', id);
export const requestOpenUrlInWorkspace = async (url: string, id: string) => await ipcRenderer.invoke('request-open-url-in-workspace', url, id);
export const requestRealignActiveWorkspace = async () => await ipcRenderer.invoke('request-realign-active-workspace');
export const requestRemoveWorkspace = async (id: string) => await ipcRenderer.invoke('request-remove-workspace', id);
export const requestRemoveWorkspacePicture = async (id: string) => await ipcRenderer.invoke('request-remove-workspace-picture', id);
export const requestSetActiveWorkspace = async (id: string) => await ipcRenderer.invoke('request-set-active-workspace', id);
export const requestGetActiveWorkspace = () => ipcRenderer.invokeSync('request-get-active-workspace');
export const requestSetWorkspace = async (id: string, options: any) => await ipcRenderer.invoke('request-set-workspace', id, options);
export const requestSetWorkspaces = async (workspaces: any) => await ipcRenderer.invoke('request-set-workspaces', workspaces);
export const requestSetWorkspacePicture = async (id: string, picturePath: string) => await ipcRenderer.invoke('request-set-workspace-picture', id, picturePath);
export const requestWakeUpWorkspace = async (id: string) => await ipcRenderer.invoke('request-wake-up-workspace', id);

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
export const requestFindInPage = async (text: string, forward: boolean) => await ipcRenderer.invoke('request-find-in-page', text, !!forward);
export const requestStopFindInPage = async (close: boolean) => await ipcRenderer.invoke('request-stop-find-in-page', !!close);

// Auth
export const requestValidateAuthIdentity = async (windowId: string, username: string, password: string) =>
  await ipcRenderer.invoke('request-validate-auth-identity', windowId, username, password);

// Online Status
export const signalOnlineStatusChanged = async (online: boolean) => await ipcRenderer.invoke('online-status-changed', online);
