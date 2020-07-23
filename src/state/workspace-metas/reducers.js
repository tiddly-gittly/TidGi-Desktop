import { SET_WORKSPACE_META, SET_WORKSPACE_METAS } from '../../constants/actions';

import { getWorkspaceMetas } from '../../senders';

const initialState = getWorkspaceMetas();

const workspaceMetas = (state = initialState, action) => {
  switch (action.type) {
    case SET_WORKSPACE_METAS: {
      return action.workspaceMetas;
    }
    case SET_WORKSPACE_META: {
      const newState = { ...state };

      if (action.value) newState[action.id] = { ...newState[action.id], ...action.value };
      else delete newState[action.id];

      return newState;
    }
    default:
      return state;
  }
};

export default workspaceMetas;
