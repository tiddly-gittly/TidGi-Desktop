const { session } = require('electron');

const {
  createWorkspace,
  countWorkspaces,
  setActiveWorkspace,
  removeWorkspace,
  getPreviousWorkspace,
  getWorkspace,
  getWorkspaces,
  setWorkspacePicture,
} = require('./workspaces');

const {
  addView,
  setActiveView,
  removeView,
} = require('./views');

const mainWindow = require('../windows/main');

const createWorkspaceView = (name, homeUrl, picture) => {
  const newWorkspace = createWorkspace(name, homeUrl, picture);

  setActiveWorkspace(newWorkspace.id);
  addView(mainWindow.get(), getWorkspace(newWorkspace.id));
  setActiveView(mainWindow.get(), newWorkspace.id);

  if (picture) {
    setWorkspacePicture(newWorkspace.id, picture);
  }
};

const setActiveWorkspaceView = (id) => {
  setActiveWorkspace(id);
  setActiveView(mainWindow.get(), id);
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
  createWorkspaceView,
  setActiveWorkspaceView,
  removeWorkspaceView,
  clearBrowsingData,
  loadURL,
};
