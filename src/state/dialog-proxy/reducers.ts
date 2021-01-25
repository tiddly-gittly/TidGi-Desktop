import { combineReducers } from 'redux';

import { DIALOG_PROXY_FORM_UPDATE, DIALOG_PROXY_INIT } from '../../constants/actions';

const formInitialState = {
  proxyBypassRules: '',
  proxyPacScript: '',
  proxyRules: '',
  proxyType: 'none',
};
const form = async (state = formInitialState, action: any) => {
  switch (action.type) {
    case DIALOG_PROXY_INIT: {
      const { proxyBypassRules, proxyPacScript, proxyRules, proxyType } = await window.service.preference.getPreferences();

      return {
        proxyBypassRules,
        proxyPacScript,
        proxyRules,
        proxyType,
      };
    }
    case DIALOG_PROXY_FORM_UPDATE: {
      const { changes } = action;
      return { ...state, ...changes };
    }
    default:
      return state;
  }
};

export default combineReducers({
  form,
});
