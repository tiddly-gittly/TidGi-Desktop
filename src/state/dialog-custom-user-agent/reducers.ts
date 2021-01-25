import { combineReducers } from 'redux';

import { UPDATE_CUSTOM_USER_AGENT_FORM, DIALOG_CUSTOM_USER_AGENT_INIT } from '../../constants/actions';

const form = (state = {}, action: any) => {
  switch (action.type) {
    case DIALOG_CUSTOM_USER_AGENT_INIT:
      return { code: await window.service.preference.get('customUserAgent') };
    case UPDATE_CUSTOM_USER_AGENT_FORM:
      return { ...state, ...action.changes };
    default:
      return state;
  }
};

export default combineReducers({ form });
