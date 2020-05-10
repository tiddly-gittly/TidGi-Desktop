import { combineReducers } from 'redux';

import { UPDATE_CODE_INJECTION_FORM, DIALOG_CODE_INJECTION_INIT } from '../../constants/actions';

import { getPreference } from '../../senders';

const form = (state = {}, action) => {
  switch (action.type) {
    case DIALOG_CODE_INJECTION_INIT: {
      const codeInjectionType = window.require('electron').remote.getGlobal('codeInjectionType');
      return {
        code: getPreference(`${codeInjectionType}CodeInjection`),
        // allowNodeInJsCodeInjection is only used for js injection
        allowNodeInJsCodeInjection: codeInjectionType === 'js' ? getPreference('allowNodeInJsCodeInjection') : false,
      };
    }
    case UPDATE_CODE_INJECTION_FORM: return { ...state, ...action.changes };
    default: return state;
  }
};

export default combineReducers({ form });
