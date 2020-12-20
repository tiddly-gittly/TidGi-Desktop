import { SET_WORKSPACE, SET_WORKSPACES } from '../../constants/actions';

export const setWorkspace = (id: any, value: any) => ({
  type: SET_WORKSPACE,
  id,
  value,
});

export const setWorkspaces = (workspaces: any) => ({
  type: SET_WORKSPACES,
  workspaces,
});
