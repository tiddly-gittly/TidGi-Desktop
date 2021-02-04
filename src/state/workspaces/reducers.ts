import { SET_WORKSPACE, SET_WORKSPACES } from '../../constants/actions';

const workspaces = async (state = initialState, action: any) => {
  if (state === undefined) {
    state = await window.service.workspace.getWorkspaces();
  }
  switch (action.type) {
    case SET_WORKSPACES: {
      return action.workspaces;
    }
    case SET_WORKSPACE: {
      const newState = { ...state };

      if (action.value) newState[action.id] = { ...newState[action.id], ...action.value };
      else delete newState[action.id];

      return newState;
    }
    default:
      return state;
  }
};

export default workspaces;
