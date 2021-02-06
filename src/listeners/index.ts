import { setWikiCreationMessage } from '../state/dialog-add-workspace/actions';
import { setPreference } from '../state/preferences/actions';
import { setSystemPreference } from '../state/system-preferences/actions';
import { setWorkspace, setWorkspaces } from '../state/workspaces/actions';
import { setWorkspaceMeta, setWorkspaceMetas } from '../state/workspace-metas/actions';

import {
  updateAddressBarInfo,
  updateCanGoBack,
  updateCanGoForward,
  updateIsFullScreen,
  updateShouldUseDarkColors,
  updateTitle,
} from '../state/general/actions';
import { closeFindInPage, openFindInPage, updateFindInPageMatches } from '../state/find-in-page/actions';
import { updatePauseNotificationsInfo } from '../state/notifications/actions';
import { updateUpdater } from '../state/updater/actions';

const loadListeners = (store: any) => {
  const { ipcRenderer } = window.remote;

  ipcRenderer.on('create-wiki-progress', (event: Electron.IpcRendererEvent, message: any) => {
    store.dispatch(setWikiCreationMessage(message));
  });

  ipcRenderer.on('log', (_event: Electron.IpcRendererEvent, message: any) => {
    if (message) console.log(message); // eslint-disable-line no-console
  });

  ipcRenderer.on('set-preference', (_event: Electron.IpcRendererEvent, name: any, value: any) => {
    store.dispatch(setPreference(name, value));
  });

  ipcRenderer.on('set-system-preference', (_event: Electron.IpcRendererEvent, name: any, value: any) => {
    store.dispatch(setSystemPreference(name, value));
  });

  ipcRenderer.on('set-workspace', (_event: Electron.IpcRendererEvent, id: any, value: any) => {
    store.dispatch(setWorkspace(id, value));
  });

  ipcRenderer.on('set-workspaces', (_event: Electron.IpcRendererEvent, newWorkspaces: any) => {
    store.dispatch(setWorkspaces(newWorkspaces));
  });

  ipcRenderer.on('set-workspace-meta', (_event: Electron.IpcRendererEvent, id: any, value: any) => {
    store.dispatch(setWorkspaceMeta(id, value));
  });

  ipcRenderer.on('set-workspace-metas', (newWorkspaceMetas: any) => {
    store.dispatch(setWorkspaceMetas(newWorkspaceMetas));
  });

  ipcRenderer.on('update-can-go-back', (_event: Electron.IpcRendererEvent, value: any) => {
    store.dispatch(updateCanGoBack(value));
  });

  ipcRenderer.on('update-address', (_event: Electron.IpcRendererEvent, address: any, edited: any) => {
    store.dispatch(updateAddressBarInfo(address, edited));
  });

  ipcRenderer.on('update-title', (_event: Electron.IpcRendererEvent, title: any) => {
    store.dispatch(updateTitle(title));
  });

  ipcRenderer.on('update-can-go-forward', (_event: Electron.IpcRendererEvent, value: any) => {
    store.dispatch(updateCanGoForward(value));
  });

  // Find In Page
  ipcRenderer.on('open-find-in-page', () => {
    store.dispatch(openFindInPage());
  });

  ipcRenderer.on('close-find-in-page', () => {
    store.dispatch(closeFindInPage());
  });

  ipcRenderer.on('update-find-in-page-matches', (_event: Electron.IpcRendererEvent, activeMatch: any, matches: any) => {
    store.dispatch(updateFindInPageMatches(activeMatch, matches));
  });

  // send back a request with text
  ipcRenderer.on('request-back-find-in-page', (_event: Electron.IpcRendererEvent, forward: any) => {
    const { open, text } = store.getState().findInPage;
    if (!open) return;
    void window.service.window.findInPage(text, forward);
  });

  ipcRenderer.on('should-pause-notifications-changed', (_event: Electron.IpcRendererEvent, value: any) => {
    store.dispatch(updatePauseNotificationsInfo(value));
  });

  ipcRenderer.on('update-updater', (_event: Electron.IpcRendererEvent, updaterObject: any) => {
    store.dispatch(updateUpdater(updaterObject));
  });

  ipcRenderer.on('native-theme-updated', () => {
    store.dispatch(updateShouldUseDarkColors(getShouldUseDarkColors()));
  });

  ipcRenderer.on('is-fullscreen-updated', (_event: Electron.IpcRendererEvent, value: any) => {
    store.dispatch(updateIsFullScreen(value));
  });
};

export default loadListeners;
