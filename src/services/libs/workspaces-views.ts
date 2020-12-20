import { app, session } from 'electron';

import {
  countWorkspaces,
  createWorkspace,
  getActiveWorkspace,
  getPreviousWorkspace,
  getWorkspace,
  getWorkspaces,
  removeWorkspace,
  setActiveWorkspace,
  setWorkspace,
  setWorkspaces,
  setWorkspacePicture,
} from './workspaces';
import sendToAllWindows from './send-to-all-windows';

import { addView, hibernateView, removeView, setActiveView, setViewsAudioPref, setViewsNotificationsPref, realignActiveView } from './views';

import * as mainWindow from '../windows/main';

const createWorkspaceView = (
  name: any,
  isSubWiki: any,
  mainWikiToLink: any,
  port: any,
  homeUrl: any,
  gitUrl: any,
  picture: any,
  transparentBackground: any,
  tagName: any,
) => {
  const newWorkspace = createWorkspace(name, isSubWiki, mainWikiToLink, port, homeUrl, gitUrl, transparentBackground, tagName);

  if (!isSubWiki) {
    setActiveWorkspace(newWorkspace.id);
    setActiveView(mainWindow.get(), newWorkspace.id);
  }
  addView(mainWindow.get(), getWorkspace(newWorkspace.id));

  if (picture) {
    setWorkspacePicture(newWorkspace.id, picture);
  }
};

const setWorkspaceView = (id: any, options: any) => {
  setWorkspace(id, options);
  setViewsAudioPref();
  setViewsNotificationsPref();
};

const setWorkspaceViews = (workspaces: any) => {
  setWorkspaces(workspaces);
  setViewsAudioPref();
  setViewsNotificationsPref();
};

const wakeUpWorkspaceView = (id: any) => {
  addView(mainWindow.get(), getWorkspace(id));
  setWorkspace(id, {
    hibernated: false,
  });
};

const hibernateWorkspaceView = (id: any) => {
  if (!getWorkspace(id).active) {
    hibernateView(id);
    setWorkspace(id, {
      hibernated: true,
    });
  }
};

const setActiveWorkspaceView = (id: any) => {
  const oldActiveWorkspace = getActiveWorkspace();

  setActiveWorkspace(id);
  setActiveView(mainWindow.get(), id);

  // hibernate old view
  // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
  if (oldActiveWorkspace.hibernateWhenUnused && oldActiveWorkspace.id !== id) {
    // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
    hibernateWorkspaceView(oldActiveWorkspace.id);
  }
};

const removeWorkspaceView = (id: any) => {
  // if there's only one workspace left, clear all
  if (countWorkspaces() === 1) {
    const win = mainWindow.get();
    if (win) {
      win.setBrowserView(null);
      win.setTitle(app.name);
      sendToAllWindows('update-title', '');
    }
  } else if (countWorkspaces() > 1 && getWorkspace(id).active) {
    // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
    setActiveWorkspaceView(getPreviousWorkspace(id).id);
  }

  removeWorkspace(id);
  removeView(id);
};

const clearBrowsingData = () => {
  session.defaultSession.clearStorageData();
  const workspaces = getWorkspaces();
  Object.keys(workspaces).forEach((id) => {
    session.fromPartition(`persist:${id}`).clearStorageData();
  });

  // shared session
  session.fromPartition('persist:shared').clearStorageData();
};

const loadURL = (url: any, id: any) => {
  if (id) {
    setActiveWorkspace(id);
    setActiveView(mainWindow.get(), id);
  }

  // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
  const v = mainWindow.get().getBrowserView();
  if (v) {
    v.webContents.focus();
    v.webContents.loadURL(url);
  }
};

const realignActiveWorkspaceView = () => {
  const activeWorkspace = getActiveWorkspace();
  const win = mainWindow.get();
  if (activeWorkspace && win) {
    // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
    realignActiveView(win, activeWorkspace.id);
  }
};

export {
  clearBrowsingData,
  createWorkspaceView,
  hibernateWorkspaceView,
  loadURL,
  removeWorkspaceView,
  setActiveWorkspaceView,
  setWorkspaceView,
  setWorkspaceViews,
  wakeUpWorkspaceView,
  realignActiveWorkspaceView,
};
