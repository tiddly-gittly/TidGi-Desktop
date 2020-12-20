import { app } from 'electron';
import path from 'path';
import fsExtra from 'fs-extra';
import settings from 'electron-settings';
import { v1 as uuidv1 } from 'uuid';
import Jimp from 'jimp';
import isUrl from 'is-url';
import download from 'download';
import tmp from 'tmp';

import sendToAllWindows from './send-to-all-windows';
import wikiStartup from './wiki/wiki-startup';
import { stopWatchWiki } from './wiki/watch-wiki';
import { stopWiki } from './wiki/wiki-worker-mamager';
import { updateSubWikiPluginContent } from './wiki/update-plugin-content';

const v = '14';

let workspaces: any;

const countWorkspaces = () => Object.keys(workspaces).length;

const getWorkspaces = () => {
  if (workspaces) return workspaces;

  const storedWorkspaces = settings.getSync(`workspaces.${v}`) || {};

  // keep workspace objects in memory
  workspaces = storedWorkspaces;

  return workspaces;
};

const getWorkspacesAsList = () => {
  // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
  const workspaceLst = Object.values(getWorkspaces()).sort((a, b) => a.order - b.order);

  return workspaceLst;
};

const getWorkspace = (id: any) => workspaces[id];
// @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
const getWorkspaceByName = (name: any) => getWorkspacesAsList().find((workspace) => workspace.name === name);

const getPreviousWorkspace = (id: any) => {
  const workspaceLst = getWorkspacesAsList();

  let currentWorkspaceI = 0;
  // @ts-expect-error ts-migrate(2569) FIXME: Type 'IterableIterator<[number, unknown]>' is not ... Remove this comment to see the full error message
  for (const [index, element] of workspaceLst.entries()) {
    if (element.id === id) {
      currentWorkspaceI = index;
      break;
    }
  }

  if (currentWorkspaceI === 0) {
    return workspaceLst[workspaceLst.length - 1];
  }
  return workspaceLst[currentWorkspaceI - 1];
};

const getNextWorkspace = (id: any) => {
  const workspaceLst = getWorkspacesAsList();

  let currentWorkspaceI = 0;
  // @ts-expect-error ts-migrate(2569) FIXME: Type 'IterableIterator<[number, unknown]>' is not ... Remove this comment to see the full error message
  for (const [index, element] of workspaceLst.entries()) {
    if (element.id === id) {
      currentWorkspaceI = index;
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
  // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
  return Object.values(workspaces).find((workspace) => workspace.active);
};

const setActiveWorkspace = (id: any) => {
  // deactive the current one
  let currentActiveWorkspace = getActiveWorkspace();
  if (currentActiveWorkspace) {
    // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
    if (currentActiveWorkspace.id === id) return;
    // @ts-expect-error ts-migrate(2698) FIXME: Spread types may only be created from object types... Remove this comment to see the full error message
    currentActiveWorkspace = { ...currentActiveWorkspace };
    // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
    currentActiveWorkspace.active = false;
    // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
    workspaces[currentActiveWorkspace.id] = currentActiveWorkspace;
    // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
    sendToAllWindows('set-workspace', currentActiveWorkspace.id, currentActiveWorkspace);
    // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
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

const setWorkspace = (id: any, options: any) => {
  const workspace = { ...workspaces[id], ...options };
  // set fileSystemPaths on sub-wiki setting update
  if (workspaces[id].isSubWiki && options.tagName && workspaces[id].tagName !== options.tagName) {
    const subWikiFolderName = path.basename(workspaces[id].name);
    updateSubWikiPluginContent(
      workspaces[id].mainWikiToLink,
      { tagName: options.tagName, subWikiFolderName },
      { tagName: workspaces[id].tagName, subWikiFolderName },
    );
    wikiStartup(workspace);
  }
  workspaces[id] = workspace;
  sendToAllWindows('set-workspace', id, workspace);
  settings.setSync(`workspaces.${v}.${id}`, workspace);
};

const setWorkspaces = (newWorkspaces: any) => {
  workspaces = newWorkspaces;
  sendToAllWindows('set-workspaces', newWorkspaces);
  settings.setSync(`workspaces.${v}`, newWorkspaces);
};

const setWorkspacePicture = (id: any, sourcePicturePath: any) => {
  const workspace = getWorkspace(id);
  const pictureId = uuidv1();

  if (workspace.picturePath === sourcePicturePath) {
    return;
  }

  const destinationPicturePath = path.join(app.getPath('userData'), 'pictures', `${pictureId}.png`);

  Promise.resolve()
    .then(() => {
      if (isUrl(sourcePicturePath)) {
        const temporaryObject = tmp.dirSync();
        const temporaryPath = temporaryObject.name;
        return download(sourcePicturePath, temporaryPath, {
          filename: 'e.png',
        }).then(() => path.join(temporaryPath, 'e.png'));
      }

      return sourcePicturePath;
    })
    .then((picturePath) => Jimp.read(picturePath))
    .then(
      (img) =>
        new Promise((resolve) => {
          img.clone().resize(128, 128).quality(100).write(destinationPicturePath, resolve);
        }),
    )
    .then(() => {
      const currentPicturePath = getWorkspace(id).picturePath;
      setWorkspace(id, {
        pictureId,
        picturePath: destinationPicturePath,
      });
      if (currentPicturePath) {
        return fsExtra.remove(currentPicturePath);
      }
      return null;
    })
    .catch(console.log); // eslint-disable-line no-console
};

const removeWorkspacePicture = (id: any) => {
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

const removeWorkspace = (id: any) => {
  const { name } = workspaces[id];
  stopWiki(name);
  stopWatchWiki(name);
  delete workspaces[id];
  sendToAllWindows('set-workspace', id, null);
  settings.unsetSync(`workspaces.${v}.${id}`);
};

const createWorkspace = (name: any, isSubWiki: any, mainWikiToLink: any, port: any, homeUrl: any, gitUrl: any, transparentBackground: any, tagName: any) => {
  const newId = uuidv1();

  // find largest order
  const workspaceLst = getWorkspacesAsList();
  let max = 0;
  for (const element of workspaceLst) {
    // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
    if (element.order > max) {
      // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
      max = element.order;
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
    tagName,
  };

  workspaces[newId] = newWorkspace;
  sendToAllWindows('set-workspace', newId, newWorkspace);
  settings.setSync(`workspaces.${v}.${newId}`, newWorkspace);

  return newWorkspace;
};

export {
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
