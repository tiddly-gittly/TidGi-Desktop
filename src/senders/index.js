// @flow
import type { IUserInfo } from '../helpers/user-info';

const { ipcRenderer } = window.remote;

export const requestCopyWikiTemplate = (newFolderPath: string, folderName: string) =>
  ipcRenderer.invoke('copy-wiki-template', newFolderPath, folderName);
export const requestCreateSubWiki = (
  newFolderPath: string,
  folderName: string,
  mainWikiToLink: string,
  tagName?: string,
  onlyLink?: boolean,
) => ipcRenderer.invoke('create-sub-wiki', newFolderPath, folderName, mainWikiToLink, tagName, onlyLink);
export const ensureWikiExist = (wikiPath: string, shouldBeMainWiki: boolean) =>
  ipcRenderer.invoke('ensure-wiki-exist', wikiPath, shouldBeMainWiki);
export const requestCloneWiki = (
  parentFolderLocation: string,
  wikiFolderName: string,
  githubWikiUrl: string,
  userInfo: IUserInfo,
) => ipcRenderer.invoke('clone-wiki', parentFolderLocation, wikiFolderName, githubWikiUrl, userInfo);
export const requestCloneSubWiki = (
  parentFolderLocation: string,
  wikiFolderName: string,
  mainWikiPath: string,
  githubWikiUrl: string,
  userInfo: IUserInfo,
  tagName?: string,
) =>
  ipcRenderer.invoke(
    'clone-sub-wiki',
    parentFolderLocation,
    wikiFolderName,
    mainWikiPath,
    githubWikiUrl,
    userInfo,
    tagName,
  );
export const getSubWikiPluginContent = (mainWikiPath: string): Promise<{ tagName: string, folderName: string }[]> =>
  ipcRenderer.invoke('get-sub-wiki-plugin-content', mainWikiPath);
export const requestOpen = (uri: string, isDirectory?: boolean) => ipcRenderer.send('request-open', uri, !!isDirectory);
export const requestShowMessageBox = (message: string, type: string) =>
  ipcRenderer.send('request-show-message-box', message, type);
export const requestLoadUrl = (url: string, id: string) => ipcRenderer.send('request-load-url', url, id);

export const requestGoHome = () => ipcRenderer.send('request-go-home');
export const requestGoBack = () => ipcRenderer.send('request-go-back');
export const requestGoForward = () => ipcRenderer.send('request-go-forward');
export const requestReload = () => ipcRenderer.send('request-reload');

export const requestQuit = () => ipcRenderer.send('request-quit');
export const requestCheckForUpdates = (isSilent: boolean) => ipcRenderer.send('request-check-for-updates', isSilent);

export const requestShowAboutWindow = () => ipcRenderer.send('request-show-about-window');
export const requestShowAddWorkspaceWindow = () => ipcRenderer.send('request-show-add-workspace-window');
export const requestShowCodeInjectionWindow = (type: string) =>
  ipcRenderer.send('request-show-code-injection-window', type);
export const requestShowCustomUserAgentWindow = () => ipcRenderer.send('request-show-custom-user-agent-window');
export const requestShowEditWorkspaceWindow = (id: string) =>
  ipcRenderer.send('request-show-edit-workspace-window', id);
export const requestShowNotificationsWindow = () => ipcRenderer.send('request-show-notifications-window');
export const requestShowPreferencesWindow = (scrollTo?: string) =>
  ipcRenderer.send('request-show-preferences-window', scrollTo);
export const requestShowProxyWindow = () => ipcRenderer.send('request-show-proxy-window');
export const requestShowSpellcheckLanguagesWindow = () => ipcRenderer.send('request-show-spellcheck-languages-window');

// Notifications
export const requestShowNotification = (options: { title: string, body: string }) =>
  ipcRenderer.send('request-show-notification', options);
export const requestUpdatePauseNotificationsInfo = () => ipcRenderer.send('request-update-pause-notifications-info');
export const getPauseNotificationsInfo = () => ipcRenderer.sendSync('get-pause-notifications-info');

// Preferences
// eslint-disable-next-line no-use-before-define
export type JsonValue = string | number | boolean | null | JsonArray | JsonObject | void;
export interface JsonObject {
  [x: string]: JsonValue;
}
interface JsonArray extends Array<JsonValue> {} // tslint:disable-line no-empty-interface
export function getPreference<T = JsonValue>(name: string): T {
  return ipcRenderer.sendSync('get-preference', name);
}
export const getPreferences = () => ipcRenderer.sendSync('get-preferences');
export const requestSetPreference = (name: string, value: JsonValue) =>
  ipcRenderer.send('request-set-preference', name, value);
export const requestResetPreferences = () => ipcRenderer.send('request-reset-preferences');
export const requestShowRequireRestartDialog = () => ipcRenderer.send('request-show-require-restart-dialog');

// System Preferences
export const getSystemPreference = (name: string): JsonValue => ipcRenderer.sendSync('get-system-preference', name);
export const getSystemPreferences = (): JsonObject => ipcRenderer.sendSync('get-system-preferences');
export const requestSetSystemPreference = (name: string, value: JsonValue) =>
  ipcRenderer.send('request-set-system-preference', name, value);

// Workspace
export const countWorkspace = () => ipcRenderer.sendSync('count-workspace');
export const getWorkspace = (id: string) => ipcRenderer.sendSync('get-workspace', id);
export const getWorkspaces = () => ipcRenderer.sendSync('get-workspaces');
export const getWorkspaceRemote = (wikiFolderPath: string) =>
  ipcRenderer.invoke('get-workspaces-remote', wikiFolderPath);
export const requestClearBrowsingData = () => ipcRenderer.send('request-clear-browsing-data');
export const requestCreateWorkspace = (
  name: string,
  isSubWiki: boolean,
  mainWikiToLink: string,
  port: number,
  homeUrl: string,
  gitUrl: string,
  picture: string,
  transparentBackground: boolean,
  tagName?: string,
) =>
  ipcRenderer.invoke(
    'request-create-workspace',
    name,
    isSubWiki,
    mainWikiToLink,
    port,
    homeUrl,
    gitUrl,
    picture,
    transparentBackground,
    tagName,
  );

export const requestOpenTiddlerInWiki = (tiddlerName: string) => ipcRenderer.send('request-wiki-open-tiddler', tiddlerName);
export const requestWikiSendActionMessage = (actionMessage: string) => ipcRenderer.send('request-wiki-send-action-message', actionMessage);
export const requestHibernateWorkspace = (id: string) => ipcRenderer.send('request-hibernate-workspace', id);
export const requestOpenUrlInWorkspace = (url: string, id: string) =>
  ipcRenderer.send('request-open-url-in-workspace', url, id);
export const requestRealignActiveWorkspace = () => ipcRenderer.send('request-realign-active-workspace');
export const requestRemoveWorkspace = (id: string) => ipcRenderer.send('request-remove-workspace', id);
export const requestRemoveWorkspacePicture = (id: string) => ipcRenderer.send('request-remove-workspace-picture', id);
export const requestSetActiveWorkspace = (id: string) => ipcRenderer.send('request-set-active-workspace', id);
export const requestGetActiveWorkspace = () => ipcRenderer.sendSync('request-get-active-workspace');
export const requestSetWorkspace = (id: string, options) => ipcRenderer.send('request-set-workspace', id, options);
export const requestSetWorkspaces = workspaces => ipcRenderer.send('request-set-workspaces', workspaces);
export const requestSetWorkspacePicture = (id: string, picturePath: string) =>
  ipcRenderer.send('request-set-workspace-picture', id, picturePath);
export const requestWakeUpWorkspace = (id: string) => ipcRenderer.send('request-wake-up-workspace', id);

// eslint-disable-next-line sonarjs/no-duplicate-string
export const getIconPath = () => ipcRenderer.sendSync('get-constant', 'ICON_PATH');
export const getReactPath = () => ipcRenderer.sendSync('get-constant', 'REACT_PATH');
export const getDesktopPath = () => ipcRenderer.sendSync('get-constant', 'DESKTOP_PATH');
export const getLogFolderPath = () => ipcRenderer.sendSync('get-constant', 'LOG_FOLDER');
export const getIsDevelopment = () => ipcRenderer.sendSync('get-constant', 'isDev');

// call path
export const getBaseName = (pathString: string): string => ipcRenderer.sendSync('get-basename', pathString);
export const getDirectoryName = (pathString: string): string => ipcRenderer.sendSync('get-dirname', pathString);

// Workspace Meta
export const getWorkspaceMeta = (id: string) => ipcRenderer.sendSync('get-workspace-meta', id);
export const getWorkspaceMetas = () => ipcRenderer.sendSync('get-workspace-metas');

// Workspace Git
export const initWikiGit = (wikiFolderPath: string, githubRepoUrl: string, userInfo: Object, isMainWiki: boolean) =>
  ipcRenderer.invoke('request-init-wiki-git', wikiFolderPath, githubRepoUrl, userInfo, isMainWiki);

// Find In Page
export const requestFindInPage = (text: string, forward?: boolean) =>
  ipcRenderer.send('request-find-in-page', text, !!forward);
export const requestStopFindInPage = (close?: boolean) => ipcRenderer.send('request-stop-find-in-page', !!close);

// Auth
export const requestValidateAuthIdentity = (windowId: string, username: string, password: string) =>
  ipcRenderer.send('request-validate-auth-identity', windowId, username, password);

// Native Theme
export const getShouldUseDarkColors = () => ipcRenderer.sendSync('get-should-use-dark-colors');

// Online Status
export const signalOnlineStatusChanged = (online: boolean) => ipcRenderer.send('online-status-changed', online);
