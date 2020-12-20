import { SET_WORKSPACE_META, SET_WORKSPACE_METAS } from '../../constants/actions';

export const setWorkspaceMeta = (id, value) => ({
  type: SET_WORKSPACE_META,
  id,
  value,
});

export const setWorkspaceMetas = (workspaceMetas) => ({
  type: SET_WORKSPACE_METAS,
  workspaceMetas,
});
