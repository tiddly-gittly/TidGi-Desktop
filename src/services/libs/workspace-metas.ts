import sendToAllWindows from './send-to-all-windows';

// to keep workspace variables (meta) that
// are not saved to disk
// badge count, error, etc
const workspaceMetas = {};

// @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
const getWorkspaceMeta = (id: any) => workspaceMetas[id] || {};

const getWorkspaceMetas = () => workspaceMetas;

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

export { getWorkspaceMeta, getWorkspaceMetas, setWorkspaceMeta };
