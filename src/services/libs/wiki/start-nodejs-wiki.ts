const path = require('path');
const fs = require('fs-extra');
const { dialog } = require('electron');

const { startWiki } = require('./wiki-worker-mamager');
const mainWindow = require('../../windows/main');
const i18n = require('../i18n');

module.exports = function startNodeJSWiki(homePath, port, userName, workspaceID) {
  if (!homePath || typeof homePath !== 'string' || !path.isAbsolute(homePath)) {
    const errorMessage = i18n.t('Dialog.NeedCorrectTiddlywikiFolderPath');
    console.error(errorMessage);
    dialog.showMessageBox(mainWindow.get(), {
      title: i18n.t('Dialog.PathPassInCantUse'),
      message: errorMessage + homePath,
      buttons: ['OK'],
      cancelId: 0,
      defaultId: 0,
    });
    return Promise.resolve();
  }
  if (!fs.pathExistsSync(homePath)) {
    const errorMessage = i18n.t('Dialog.CantFindWorkspaceFolderRemoveWorkspace');
    console.error(errorMessage);
    dialog
      .showMessageBox(mainWindow.get(), {
        title: i18n.t('Dialog.WorkspaceFolderRemoved'),
        message: errorMessage + homePath,
        buttons: [i18n.t('Dialog.RemoveWorkspace'), i18n.t('Dialog.DoNotCare')],
        cancelId: 1,
        defaultId: 0,
      })
      .then(({ response }) => {
        // eslint-disable-next-line promise/always-return
        if (response === 0) {
          // eslint-disable-next-line global-require
          const { removeWorkspaceView } = require('../workspaces-views'); // prevent circular dependence
          // eslint-disable-next-line global-require
          const createMenu = require('../create-menu');
          removeWorkspaceView(workspaceID);
          createMenu();
        }
      })
      .catch(console.log);
    return Promise.resolve();
  }

  return startWiki(homePath, port, userName);
};
