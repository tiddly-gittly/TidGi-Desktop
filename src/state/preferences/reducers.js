import { SET_PREFERENCE } from '../../constants/actions';

import { getPreferences } from '../../senders';

const initialState = getPreferences();

const preferences = (state = initialState, action) => {
  switch (action.type) {
    case SET_PREFERENCE: {
      const newState = { ...state };
      newState[action.name] = action.value;

      return newState;
    }
    default:
      return state;
  }
};

export default preferences;
