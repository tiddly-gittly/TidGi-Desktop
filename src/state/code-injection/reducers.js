import { combineReducers } from 'redux';

import { UPDATE_CODE_INJECTION_FORM } from '../../constants/actions';

import { getPreference } from '../../senders';

const codeInjectionType = window.require('electron').remote.getGlobal('codeInjectionType');
const defaultForm = {
  code: getPreference(`${codeInjectionType}CodeInjection`),
};

const form = (state = defaultForm, action) => {
  switch (action.type) {
    case UPDATE_CODE_INJECTION_FORM: return { ...state, ...action.changes };
    default: return state;
  }
};

export default combineReducers({ form });
