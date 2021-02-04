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

// eslint-disable-next-line sonarjs/no-duplicate-string
export const getIconPath = () => ipcRenderer.invokeSync('get-constant', 'ICON_PATH');
export const getReactPath = () => ipcRenderer.invokeSync('get-constant', 'REACT_PATH');
export const getDesktopPath = () => ipcRenderer.invokeSync('get-constant', 'DESKTOP_PATH');
export const getLogFolderPath = () => ipcRenderer.invokeSync('get-constant', 'LOG_FOLDER');
export const getIsDevelopment = () => ipcRenderer.invokeSync('get-constant', 'isDev');

// call path
export const getBaseName = (pathString: string): string => ipcRenderer.invokeSync('get-basename', pathString);
export const getDirectoryName = (pathString: string): string => ipcRenderer.invokeSync('get-dirname', pathString);

// Find In Page
export const requestFindInPage = async (text: string, forward: boolean) => await ipcRenderer.invoke('request-find-in-page', text, !!forward);
export const requestStopFindInPage = async (close: boolean) => await ipcRenderer.invoke('request-stop-find-in-page', !!close);

// Auth
export const requestValidateAuthIdentity = async (windowId: string, username: string, password: string) =>
  await ipcRenderer.invoke('request-validate-auth-identity', windowId, username, password);

// Online Status
export const signalOnlineStatusChanged = async (online: boolean) => await ipcRenderer.invoke('online-status-changed', online);
