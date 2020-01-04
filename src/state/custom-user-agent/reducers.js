import { combineReducers } from 'redux';

import { UPDATE_CUSTOM_USER_AGENT_FORM } from '../../constants/actions';

import { getPreference } from '../../senders';

const defaultForm = {
  code: getPreference('customUserAgent'),
};

const form = (state = defaultForm, action) => {
  switch (action.type) {
    case UPDATE_CUSTOM_USER_AGENT_FORM: return { ...state, ...action.changes };
    default: return state;
  }
};

export default combineReducers({ form });
