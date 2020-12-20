import { SET_WORKSPACE_META, SET_WORKSPACE_METAS } from '../../constants/actions';

export const setWorkspaceMeta = (id: any, value: any) => ({
  type: SET_WORKSPACE_META,
  id,
  value,
});

export const setWorkspaceMetas = (workspaceMetas: any) => ({
  type: SET_WORKSPACE_METAS,
  workspaceMetas,
});
