import { combineReducers } from 'redux';

import { UPDATE_EDIT_WORKSPACE_FORM } from '../../constants/actions';

import { getWorkspaces } from '../../senders';
import getWorkspacesAsList from '../../helpers/get-workspaces-as-list';

let defaultForm = {};
const editWorkspaceId = window.require('electron').remote.getGlobal('editWorkspaceId');
if (editWorkspaceId) {
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
  defaultForm = workspace;
}

const form = (state = defaultForm, action) => {
  switch (action.type) {
    case UPDATE_EDIT_WORKSPACE_FORM: return { ...state, ...action.changes };
    default: return state;
  }
};

export default combineReducers({ form });
