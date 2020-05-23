import { setPreference } from '../state/preferences/actions';
import { setSystemPreference } from '../state/system-preferences/actions';
import { setWorkspace, setWorkspaces } from '../state/workspaces/actions';
import { setWorkspaceMeta, setWorkspaceMetas } from '../state/workspace-metas/actions';

import {
  updateAddressBarInfo,
  updateCanGoBack,
  updateCanGoForward,
  updateDidFailLoad,
  updateIsFullScreen,
  updateIsLoading,
  updateShouldUseDarkColors,
  updateTitle,
} from '../state/general/actions';
import {
  closeFindInPage,
  openFindInPage,
  updateFindInPageMatches,
} from '../state/find-in-page/actions';
import {
  updatePauseNotificationsInfo,
} from '../state/notifications/actions';
import { updateUpdater } from '../state/updater/actions';
import {
  getShouldUseDarkColors,
  requestFindInPage,
  signalOnlineStatusChanged,
} from '../senders';

const loadListeners = (store) => {
  const { ipcRenderer } = window.require('electron');

  if (window.mode === 'main') {
    // automatically reload page when wifi/network is connected
    // https://www.electronjs.org/docs/tutorial/online-offline-events
    const handleOnlineOffline = () => signalOnlineStatusChanged(window.navigator.onLine);
    window.addEventListener('online', handleOnlineOffline);
    window.addEventListener('offline', handleOnlineOffline);
  }

  ipcRenderer.on('log', (e, message) => {
    if (message) console.log(message); // eslint-disable-line no-console
  });

  ipcRenderer.on('set-preference', (e, name, value) => {
    store.dispatch(setPreference(name, value));
  });

  ipcRenderer.on('set-system-preference', (e, name, value) => {
    store.dispatch(setSystemPreference(name, value));
  });

  ipcRenderer.on('set-workspace', (e, id, value) => {
    store.dispatch(setWorkspace(id, value));
  });

  ipcRenderer.on('set-workspaces', () => {
    store.dispatch(setWorkspaces());
  });

  ipcRenderer.on('set-workspace-meta', (e, id, value) => {
    store.dispatch(setWorkspaceMeta(id, value));
  });

  ipcRenderer.on('set-workspace-metas', () => {
    store.dispatch(setWorkspaceMetas());
  });

  ipcRenderer.on('update-can-go-back', (e, value) => {
    store.dispatch(updateCanGoBack(value));
  });

  ipcRenderer.on('update-address', (e, address, edited) => {
    store.dispatch(updateAddressBarInfo(address, edited));
  });

  ipcRenderer.on('update-title', (e, title) => {
    store.dispatch(updateTitle(title));
  });

  ipcRenderer.on('update-can-go-forward', (e, value) => {
    store.dispatch(updateCanGoForward(value));
  });

  ipcRenderer.on('update-is-loading', (e, value) => {
    store.dispatch(updateIsLoading(value));
  });

  ipcRenderer.on('update-did-fail-load', (e, value) => {
    store.dispatch(updateDidFailLoad(value));
  });

  // Find In Page
  ipcRenderer.on('open-find-in-page', () => {
    store.dispatch(openFindInPage());
  });

  ipcRenderer.on('close-find-in-page', () => {
    store.dispatch(closeFindInPage());
  });

  ipcRenderer.on('update-find-in-page-matches', (e, activeMatch, matches) => {
    store.dispatch(updateFindInPageMatches(activeMatch, matches));
  });

  // send back a request with text
  ipcRenderer.on('request-back-find-in-page', (e, forward) => {
    const { open, text } = store.getState().findInPage;
    if (!open) return;
    requestFindInPage(text, forward);
  });

  ipcRenderer.on('should-pause-notifications-changed', (e, val) => {
    store.dispatch(updatePauseNotificationsInfo(val));
  });

  ipcRenderer.on('update-updater', (e, updaterObj) => {
    store.dispatch(updateUpdater(updaterObj));
  });

  ipcRenderer.on('native-theme-updated', () => {
    store.dispatch(updateShouldUseDarkColors(getShouldUseDarkColors()));
  });

  ipcRenderer.on('is-fullscreen-updated', (e, val) => {
    store.dispatch(updateIsFullScreen(val));
  });
};

export default loadListeners;
