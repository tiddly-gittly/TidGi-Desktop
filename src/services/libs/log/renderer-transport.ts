/* eslint-disable global-require */
import Transport from 'winston-transport';

const handlers = {
  createWikiProgress: (message: any) => {
    require('../../windows/add-workspace') // require here to prevent possible circular dependence
      .get()
      .webContents.send('create-wiki-progress', message);
  },
  wikiSyncProgress: (message: any) => {
    const { getActiveBrowserView } = require('../views');
    const browserView = getActiveBrowserView();
    if (browserView) {
      browserView.webContents.send('wiki-sync-progress', message);
    }
  },
};

export default class RendererTransport extends Transport {
  log(info: any, callback: any) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    if (info.handler && info.handler in handlers) {
      // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      handlers[info.handler](info.message);
    }

    callback();
  }
};
