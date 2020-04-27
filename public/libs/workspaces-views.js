const { session } = require('electron');

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

const {
  addView,
  hibernateView,
  removeView,
  setActiveView,
  setViewsAudioPref,
  setViewsNotificationsPref,
} = require('./views');

const mainWindow = require('../windows/main');

const createWorkspaceView = (name, homeUrl, picture, transparentBackground) => {
  const newWorkspace = createWorkspace(name, homeUrl, transparentBackground);

  setActiveWorkspace(newWorkspace.id);
  addView(mainWindow.get(), getWorkspace(newWorkspace.id));
  setActiveView(mainWindow.get(), newWorkspace.id);

  if (picture) {
    setWorkspacePicture(newWorkspace.id, picture);
  }
};

const setWorkspaceView = (id, opts) => {
  setWorkspace(id, opts);
  setViewsAudioPref();
  setViewsNotificationsPref();
};

const setWorkspaceViews = (workspaces) => {
  setWorkspaces(workspaces);
  setViewsAudioPref();
  setViewsNotificationsPref();
};


const wakeUpWorkspaceView = (id) => {
  addView(mainWindow.get(), getWorkspace(id));
  setWorkspace(id, {
    hibernated: false,
  });
};

const hibernateWorkspaceView = (id) => {
  if (!getWorkspace(id).active) {
    hibernateView(id);
    setWorkspace(id, {
      hibernated: true,
    });
  }
};

const setActiveWorkspaceView = (id) => {
  const oldActiveWorkspace = getActiveWorkspace();

  setActiveWorkspace(id);
  setActiveView(mainWindow.get(), id);

  // hibernate old view
  if (oldActiveWorkspace.hibernateWhenUnused && oldActiveWorkspace.id !== id) {
    hibernateWorkspaceView(oldActiveWorkspace.id);
  }
};

const removeWorkspaceView = (id) => {
  if (countWorkspaces() === 1) {
    mainWindow.get().setBrowserView(null);
  }

  if (getWorkspace(id).active && countWorkspaces() > 1) {
    setActiveWorkspaceView(getPreviousWorkspace(id).id);
  }

  removeWorkspace(id);
  removeView(id);
};

const clearBrowsingData = () => {
  const workspaces = getWorkspaces();
  Object.keys(workspaces).forEach((id) => {
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
  if (v) v.webContents.loadURL(url);
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
