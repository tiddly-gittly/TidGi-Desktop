import { ipcRenderer } from 'electron';
import { ContextChannel } from '@/constants/channels';

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

// call NodeJS.path
export const getBaseName = async (pathString: string): Promise<string> => {
  const result = (await ipcRenderer.invoke(ContextChannel.getBaseName, pathString)) as string;
  if (typeof result === 'string') return result;
  throw new Error(`getBaseName get bad result ${typeof result}`);
};
export const getDirectoryName = async (pathString: string): Promise<string> => {
  const result = (await ipcRenderer.invoke(ContextChannel.getDirectoryName, pathString)) as string;
  if (typeof result === 'string') return result;
  throw new Error(`getDirectoryName get bad result ${typeof result}`);
};

// Find In Page
export const requestFindInPage = async (text: string, forward: boolean) => await ipcRenderer.invoke('request-find-in-page', text, !!forward);
export const requestStopFindInPage = async (close: boolean) => await ipcRenderer.invoke('request-stop-find-in-page', !!close);

// Auth
export const requestValidateAuthIdentity = async (windowId: string, username: string, password: string) =>
  await ipcRenderer.invoke('request-validate-auth-identity', windowId, username, password);

// Online Status
export const signalOnlineStatusChanged = async (online: boolean) => await ipcRenderer.invoke('online-status-changed', online);
