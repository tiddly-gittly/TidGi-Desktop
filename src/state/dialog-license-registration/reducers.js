import { combineReducers } from 'redux';

import {
  LICENSE_REGISTRATION_FORM_UPDATE,
} from '../../constants/actions';

const formInitialState = {
  licenseKey: '',
};
const form = (state = formInitialState, action) => {
  switch (action.type) {
    case LICENSE_REGISTRATION_FORM_UPDATE: {
      const { changes } = action;
      return { ...state, ...changes };
    }
    default: return state;
  }
};

export default combineReducers({
  form,
});
