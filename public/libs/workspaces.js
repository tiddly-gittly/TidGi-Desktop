const { app } = require('electron');
const path = require('path');
const fsExtra = require('fs-extra');
const settings = require('electron-settings');
const { v1: uuidv1 } = require('uuid');
const Jimp = require('jimp');
const isUrl = require('is-url');
const download = require('download');
const tmp = require('tmp');

const sendToAllWindows = require('./send-to-all-windows');
const { stopWiki, stopWikiWatcher } = require('./wiki/wiki-worker-mamager');

const v = '14';

let workspaces;

const countWorkspaces = () => Object.keys(workspaces).length;

const getWorkspaces = () => {
  if (workspaces) return workspaces;

  const storedWorkspaces = settings.getSync(`workspaces.${v}`) || {};

  // keep workspace objects in memory
  workspaces = storedWorkspaces;

  return workspaces;
};

const getWorkspacesAsList = () => {
  const workspaceLst = Object.values(getWorkspaces()).sort((a, b) => a.order - b.order);

  return workspaceLst;
};

const getWorkspace = id => workspaces[id];
const getWorkspaceByName = name => getWorkspacesAsList().find(workspace => workspace.name === name);

const getPreviousWorkspace = id => {
  const workspaceLst = getWorkspacesAsList();

  let currentWorkspaceI = 0;
  for (let i = 0; i < workspaceLst.length; i += 1) {
    if (workspaceLst[i].id === id) {
      currentWorkspaceI = i;
      break;
    }
  }

  if (currentWorkspaceI === 0) {
    return workspaceLst[workspaceLst.length - 1];
  }
  return workspaceLst[currentWorkspaceI - 1];
};

const getNextWorkspace = id => {
  const workspaceLst = getWorkspacesAsList();

  let currentWorkspaceI = 0;
  for (let i = 0; i < workspaceLst.length; i += 1) {
    if (workspaceLst[i].id === id) {
      currentWorkspaceI = i;
      break;
    }
  }

  if (currentWorkspaceI === workspaceLst.length - 1) {
    return workspaceLst[0];
  }
  return workspaceLst[currentWorkspaceI + 1];
};

const getActiveWorkspace = () => {
  if (!workspaces) return null;
  return Object.values(workspaces).find(workspace => workspace.active);
};

const setActiveWorkspace = id => {
  // deactive the current one
  let currentActiveWorkspace = getActiveWorkspace();
  if (currentActiveWorkspace) {
    if (currentActiveWorkspace.id === id) return;
    currentActiveWorkspace = { ...currentActiveWorkspace };
    currentActiveWorkspace.active = false;
    workspaces[currentActiveWorkspace.id] = currentActiveWorkspace;
    sendToAllWindows('set-workspace', currentActiveWorkspace.id, currentActiveWorkspace);
    settings.setSync(`workspaces.${v}.${currentActiveWorkspace.id}`, currentActiveWorkspace);
  }

  // active new one
  const newActiveWorkspace = { ...workspaces[id] };
  newActiveWorkspace.active = true;
  newActiveWorkspace.hibernated = false;
  workspaces[id] = newActiveWorkspace;
  sendToAllWindows('set-workspace', id, newActiveWorkspace);
  settings.setSync(`workspaces.${v}.${id}`, newActiveWorkspace);
};

const setWorkspace = (id, opts) => {
  const workspace = { ...workspaces[id], ...opts };
  workspaces[id] = workspace;
  sendToAllWindows('set-workspace', id, workspace);
  settings.setSync(`workspaces.${v}.${id}`, workspace);
};

const setWorkspaces = newWorkspaces => {
  workspaces = newWorkspaces;
  sendToAllWindows('set-workspaces', newWorkspaces);
  settings.setSync(`workspaces.${v}`, newWorkspaces);
};

const setWorkspacePicture = (id, sourcePicturePath) => {
  const workspace = getWorkspace(id);
  const pictureId = uuidv1();

  if (workspace.picturePath === sourcePicturePath) {
    return;
  }

  const destPicturePath = path.join(app.getPath('userData'), 'pictures', `${pictureId}.png`);

  Promise.resolve()
    .then(() => {
      if (isUrl(sourcePicturePath)) {
        const tmpObj = tmp.dirSync();
        const tmpPath = tmpObj.name;
        return download(sourcePicturePath, tmpPath, {
          filename: 'e.png',
        }).then(() => path.join(tmpPath, 'e.png'));
      }

      return sourcePicturePath;
    })
    .then(picturePath => Jimp.read(picturePath))
    .then(
      img =>
        new Promise(resolve => {
          img
            .clone()
            .resize(128, 128)
            .quality(100)
            .write(destPicturePath, resolve);
        }),
    )
    .then(() => {
      const currentPicturePath = getWorkspace(id).picturePath;
      setWorkspace(id, {
        pictureId,
        picturePath: destPicturePath,
      });
      if (currentPicturePath) {
        return fsExtra.remove(currentPicturePath);
      }
      return null;
    })
    .catch(console.log); // eslint-disable-line no-console
};

const removeWorkspacePicture = id => {
  const workspace = getWorkspace(id);
  if (workspace.picturePath) {
    return fsExtra.remove(workspace.picturePath).then(() => {
      setWorkspace(id, {
        pictureId: null,
        picturePath: null,
      });
    });
  }
  return Promise.resolve();
};

const removeWorkspace = id => {
  const { name } = workspaces[id];
  stopWiki(name);
  stopWikiWatcher(name);
  delete workspaces[id];
  sendToAllWindows('set-workspace', id, null);
  settings.unsetSync(`workspaces.${v}.${id}`);
};

const createWorkspace = (name, isSubWiki, mainWikiToLink, port, homeUrl, gitUrl, transparentBackground) => {
  const newId = uuidv1();

  // find largest order
  const workspaceLst = getWorkspacesAsList();
  let max = 0;
  for (let i = 0; i < workspaceLst.length; i += 1) {
    if (workspaceLst[i].order > max) {
      max = workspaceLst[i].order;
    }
  }

  const newWorkspace = {
    active: false,
    hibernated: false,
    isSubWiki,
    mainWikiToLink,
    port,
    homeUrl,
    gitUrl,
    id: newId,
    name,
    order: max + 1,
    transparentBackground,
  };

  workspaces[newId] = newWorkspace;
  sendToAllWindows('set-workspace', newId, newWorkspace);
  settings.setSync(`workspaces.${v}.${newId}`, newWorkspace);

  return newWorkspace;
};

module.exports = {
  countWorkspaces,
  createWorkspace,
  getActiveWorkspace,
  getNextWorkspace,
  getPreviousWorkspace,
  getWorkspace,
  getWorkspaceByName,
  getWorkspaces,
  getWorkspacesAsList,
  removeWorkspace,
  setActiveWorkspace,
  setWorkspace,
  setWorkspaces,
  setWorkspacePicture,
  removeWorkspacePicture,
};
