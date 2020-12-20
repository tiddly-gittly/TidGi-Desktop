import { combineReducers } from 'redux';

import { UPDATE_GO_TO_URL_FORM } from '../../constants/actions';

const defaultForm = {
  url: '',
};

const form = (state = defaultForm, action) => {
  switch (action.type) {
    case UPDATE_GO_TO_URL_FORM: return { ...state, ...action.changes };
    default: return state;
  }
};

export default combineReducers({ form });
