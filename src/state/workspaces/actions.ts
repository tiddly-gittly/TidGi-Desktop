import { SET_WORKSPACE, SET_WORKSPACES } from '../../constants/actions';

export const setWorkspace = (id, value) => ({
  type: SET_WORKSPACE,
  id,
  value,
});

export const setWorkspaces = (workspaces) => ({
  type: SET_WORKSPACES,
  workspaces,
});
