import { SET_PREFERENCE } from '../../constants/actions';

const preferences = async (state, action: any) => {
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
