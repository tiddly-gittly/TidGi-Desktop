// @ts-expect-error ts-migrate(6200) FIXME: Definitions of the following identifiers conflict ... Remove this comment to see the full error message
const { app, session } = require('electron');

const {
  countWorkspaces,
  // @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'createWork... Remove this comment to see the full error message
  createWorkspace,
  // @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getActiveW... Remove this comment to see the full error message
  getActiveWorkspace,
  // @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getPreviou... Remove this comment to see the full error message
  getPreviousWorkspace,
  getWorkspace,
  // @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getWorkspa... Remove this comment to see the full error message
  getWorkspaces,
  // @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'removeWork... Remove this comment to see the full error message
  removeWorkspace,
  // @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'setActiveW... Remove this comment to see the full error message
  setActiveWorkspace,
  // @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'setWorkspa... Remove this comment to see the full error message
  setWorkspace,
  // @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'setWorkspa... Remove this comment to see the full error message
  setWorkspaces,
  setWorkspacePicture,
} = require('./workspaces');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'sendToAllW... Remove this comment to see the full error message
const sendToAllWindows = require('./send-to-all-windows');

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'addView'.
const { addView, hibernateView, removeView, setActiveView, setViewsAudioPref, setViewsNotificationsPref, realignActiveView } = require('./views');

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'mainWindow... Remove this comment to see the full error message
const mainWindow = require('../windows/main');

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

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'setActiveW... Remove this comment to see the full error message
const setActiveWorkspaceView = (id: any) => {
  const oldActiveWorkspace = getActiveWorkspace();

  setActiveWorkspace(id);
  setActiveView(mainWindow.get(), id);

  // hibernate old view
  if (oldActiveWorkspace.hibernateWhenUnused && oldActiveWorkspace.id !== id) {
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
    realignActiveView(win, activeWorkspace.id);
  }
};

module.exports = {
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
