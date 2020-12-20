// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'sendToAllW... Remove this comment to see the full error message
const sendToAllWindows = require('./send-to-all-windows');

// to keep workspace variables (meta) that
// are not saved to disk
// badge count, error, etc
const workspaceMetas = {};

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getWorkspa... Remove this comment to see the full error message
const getWorkspaceMeta = (id: any) => workspaceMetas[id] || {};

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getWorkspa... Remove this comment to see the full error message
const getWorkspaceMetas = () => workspaceMetas;

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'setWorkspa... Remove this comment to see the full error message
const setWorkspaceMeta = (id: any, options: any) => {
  // init
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  workspaceMetas[id] = {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    ...workspaceMetas[id],
    ...options,
  };
  sendToAllWindows('set-workspace-meta', id, getWorkspaceMeta(id));
};

module.exports = {
  getWorkspaceMeta,
  getWorkspaceMetas,
  setWorkspaceMeta,
};
