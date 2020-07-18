/* eslint-disable global-require */
const Transport = require('winston-transport');

const handlers = {
  createWikiProgress: message => {
    require('../../windows/add-workspace') // require here to prevent possible circular dependence
      .get()
      .webContents.send('create-wiki-progress', message);
  },
  wikiSyncProgress: message => {
    const { getActiveWorkspace } = require('../workspaces'); // require here to prevent mysterious electron crash
    const { getView } = require('../views');

    // eslint-disable-next-line global-require
    const workspace = getActiveWorkspace();
    const browserView = getView(workspace.id);
    if (browserView) {
      browserView.webContents.send('wiki-sync-progress', message);
    }
  },
};

module.exports = class RendererTransport extends Transport {
  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    if (info.handler && info.handler in handlers) {
      handlers[info.handler](info.message);
    }

    callback();
  }
};
