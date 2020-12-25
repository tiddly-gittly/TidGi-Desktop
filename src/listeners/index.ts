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
import { getShouldUseDarkColors, requestFindInPage, signalOnlineStatusChanged } from '../senders';

const loadListeners = (store: any) => {
  const { ipcRenderer } = window.remote;

  if (window.meta.windowName === 'main') {
    // automatically reload page when wifi/network is connected
    // https://www.electronjs.org/docs/tutorial/online-offline-events
    const handleOnlineOffline = () => signalOnlineStatusChanged(window.navigator.onLine);
    window.addEventListener('online', handleOnlineOffline);
    window.addEventListener('offline', handleOnlineOffline);
  }

  ipcRenderer.on('create-wiki-progress', (event: any, message: any) => {
    store.dispatch(setWikiCreationMessage(message));
  });

  ipcRenderer.on('log', (e: any, message: any) => {
    if (message) console.log(message); // eslint-disable-line no-console
  });

  ipcRenderer.on('set-preference', (e: any, name: any, value: any) => {
    store.dispatch(setPreference(name, value));
  });

  ipcRenderer.on('set-system-preference', (e: any, name: any, value: any) => {
    store.dispatch(setSystemPreference(name, value));
  });

  ipcRenderer.on('set-workspace', (e: any, id: any, value: any) => {
    store.dispatch(setWorkspace(id, value));
  });

  ipcRenderer.on('set-workspaces', (e: any, newWorkspaces: any) => {
    store.dispatch(setWorkspaces(newWorkspaces));
  });

  ipcRenderer.on('set-workspace-meta', (e: any, id: any, value: any) => {
    store.dispatch(setWorkspaceMeta(id, value));
  });

  ipcRenderer.on('set-workspace-metas', (newWorkspaceMetas: any) => {
    store.dispatch(setWorkspaceMetas(newWorkspaceMetas));
  });

  ipcRenderer.on('update-can-go-back', (e: any, value: any) => {
    store.dispatch(updateCanGoBack(value));
  });

  ipcRenderer.on('update-address', (e: any, address: any, edited: any) => {
    store.dispatch(updateAddressBarInfo(address, edited));
  });

  ipcRenderer.on('update-title', (e: any, title: any) => {
    store.dispatch(updateTitle(title));
  });

  ipcRenderer.on('update-can-go-forward', (e: any, value: any) => {
    store.dispatch(updateCanGoForward(value));
  });

  // Find In Page
  ipcRenderer.on('open-find-in-page', () => {
    store.dispatch(openFindInPage());
  });

  ipcRenderer.on('close-find-in-page', () => {
    store.dispatch(closeFindInPage());
  });

  ipcRenderer.on('update-find-in-page-matches', (e: any, activeMatch: any, matches: any) => {
    store.dispatch(updateFindInPageMatches(activeMatch, matches));
  });

  // send back a request with text
  ipcRenderer.on('request-back-find-in-page', (e: any, forward: any) => {
    const { open, text } = store.getState().findInPage;
    if (!open) return;
    requestFindInPage(text, forward);
  });

  ipcRenderer.on('should-pause-notifications-changed', (e: any, value: any) => {
    store.dispatch(updatePauseNotificationsInfo(value));
  });

  ipcRenderer.on('update-updater', (e: any, updaterObject: any) => {
    store.dispatch(updateUpdater(updaterObject));
  });

  ipcRenderer.on('native-theme-updated', () => {
    store.dispatch(updateShouldUseDarkColors(getShouldUseDarkColors()));
  });

  ipcRenderer.on('is-fullscreen-updated', (e: any, value: any) => {
    store.dispatch(updateIsFullScreen(value));
  });
};

export default loadListeners;
