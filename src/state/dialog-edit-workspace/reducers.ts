import { combineReducers } from 'redux';

import { DIALOG_EDIT_WORKSPACE_INIT, UPDATE_EDIT_WORKSPACE_DOWNLOADING_ICON, UPDATE_EDIT_WORKSPACE_FORM } from '../../constants/actions';

const form = async (state = {}, action: any) => {
  switch (action.type) {
    case DIALOG_EDIT_WORKSPACE_INIT: {
      const editWorkspaceId = window.remote.getGlobal('editWorkspaceId');
      const workspaces = await window.service.workspace.getWorkspaces();
      const workspaceList = Object.values(workspaces);
      const workspace = workspaces[editWorkspaceId];
      workspaceList.some((item, index) => {
        // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
        if (item.id === editWorkspaceId) {
          workspace.order = index;
          return true;
        }
        return false;
      });
      return workspace;
    }
    case UPDATE_EDIT_WORKSPACE_FORM:
      return { ...state, ...action.changes };
    default:
      return state;
  }
};

const downloadingIcon = (state = false, action: any) => {
  switch (action.type) {
    case UPDATE_EDIT_WORKSPACE_DOWNLOADING_ICON:
      return action.downloadingIcon;
    default:
      return state;
  }
};

export default combineReducers({ downloadingIcon, form });
