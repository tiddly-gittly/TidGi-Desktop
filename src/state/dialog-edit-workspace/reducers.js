import { combineReducers } from 'redux';

import {
  DIALOG_EDIT_WORKSPACE_INIT,
  UPDATE_EDIT_WORKSPACE_DOWNLOADING_ICON,
  UPDATE_EDIT_WORKSPACE_FORM,
} from '../../constants/actions';

import { getWorkspaces } from '../../senders';
import getWorkspacesAsList from '../../helpers/get-workspaces-as-list';

const form = (state = {}, action) => {
  switch (action.type) {
    case DIALOG_EDIT_WORKSPACE_INIT: {
      const editWorkspaceId = window.require('electron').remote.getGlobal('editWorkspaceId');
      const workspaces = getWorkspaces();
      const workspaceList = getWorkspacesAsList(workspaces);
      const workspace = workspaces[editWorkspaceId];
      workspaceList.some((item, index) => {
        if (item.id === editWorkspaceId) {
          workspace.order = index;
          return true;
        }
        return false;
      });
      return workspace;
    }
    case UPDATE_EDIT_WORKSPACE_FORM: return { ...state, ...action.changes };
    default: return state;
  }
};

const downloadingIcon = (state = false, action) => {
  switch (action.type) {
    case UPDATE_EDIT_WORKSPACE_DOWNLOADING_ICON: return action.downloadingIcon;
    default: return state;
  }
};


export default combineReducers({ downloadingIcon, form });
