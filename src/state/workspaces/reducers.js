import { SET_WORKSPACE } from '../../constants/actions';

import { getWorkspaces } from '../../senders';

const initialState = getWorkspaces();

const workspaces = (state = initialState, action) => {
  switch (action.type) {
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
