import { SET_SYSTEM_PREFERENCE } from '../../constants/actions';

const systemPreferences = async (state, action: any) => {
  state = await window.service.systemPreference.getSystemPreferences();
  switch (action.type) {
    case SET_SYSTEM_PREFERENCE: {
      const newState = { ...state };
      newState[action.name] = action.value;

      return newState;
    }
    default:
      return state;
  }
};

export default systemPreferences;
