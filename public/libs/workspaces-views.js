const { app, session } = require('electron');

const {
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
} = require('./workspaces');
const sendToAllWindows = require('./send-to-all-windows');

const {
  addView,
  hibernateView,
  removeView,
  setActiveView,
  setViewsAudioPref,
  setViewsNotificationsPref,
} = require('./views');

const mainWindow = require('../windows/main');

const createWorkspaceView = (
  name,
  isSubWiki,
  mainWikiToLink,
  port,
  homeUrl,
  gitUrl,
  picture,
  transparentBackground,
  tagName,
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

const setWorkspaceView = (id, options) => {
  setWorkspace(id, options);
  setViewsAudioPref();
  setViewsNotificationsPref();
};

const setWorkspaceViews = workspaces => {
  setWorkspaces(workspaces);
  setViewsAudioPref();
  setViewsNotificationsPref();
};

const wakeUpWorkspaceView = id => {
  addView(mainWindow.get(), getWorkspace(id));
  setWorkspace(id, {
    hibernated: false,
  });
};

const hibernateWorkspaceView = id => {
  if (!getWorkspace(id).active) {
    hibernateView(id);
    setWorkspace(id, {
      hibernated: true,
    });
  }
};

const setActiveWorkspaceView = id => {
  const oldActiveWorkspace = getActiveWorkspace();

  setActiveWorkspace(id);
  setActiveView(mainWindow.get(), id);

  // hibernate old view
  if (oldActiveWorkspace.hibernateWhenUnused && oldActiveWorkspace.id !== id) {
    hibernateWorkspaceView(oldActiveWorkspace.id);
  }
};

const removeWorkspaceView = id => {
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
  Object.keys(workspaces).forEach(id => {
    session.fromPartition(`persist:${id}`).clearStorageData();
  });

  // shared session
  session.fromPartition('persist:shared').clearStorageData();
};

const loadURL = (url, id) => {
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
};
