// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
const path = require('path');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'fs'.
const fs = require('fs-extra');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'dialog'.
const { dialog } = require('electron');

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'startWiki'... Remove this comment to see the full error message
const { startWiki } = require('./wiki-worker-mamager');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'mainWindow... Remove this comment to see the full error message
const mainWindow = require('../../windows/main');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'index18n'.
const index18n = require('../i18n');

module.exports = function startNodeJSWiki(homePath: any, port: any, userName: any, workspaceID: any) {
  if (!homePath || typeof homePath !== 'string' || !path.isAbsolute(homePath)) {
    const errorMessage = index18n.t('Dialog.NeedCorrectTiddlywikiFolderPath');
    console.error(errorMessage);
    dialog.showMessageBox(mainWindow.get(), {
      title: index18n.t('Dialog.PathPassInCantUse'),
      message: errorMessage + homePath,
      buttons: ['OK'],
      cancelId: 0,
      defaultId: 0,
    });
    return Promise.resolve();
  }
  if (!fs.pathExistsSync(homePath)) {
    const errorMessage = index18n.t('Dialog.CantFindWorkspaceFolderRemoveWorkspace');
    console.error(errorMessage);
    dialog
      .showMessageBox(mainWindow.get(), {
        title: index18n.t('Dialog.WorkspaceFolderRemoved'),
        message: errorMessage + homePath,
        buttons: [index18n.t('Dialog.RemoveWorkspace'), index18n.t('Dialog.DoNotCare')],
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
