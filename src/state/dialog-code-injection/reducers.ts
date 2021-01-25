import { combineReducers } from 'redux';

import { UPDATE_CODE_INJECTION_FORM, DIALOG_CODE_INJECTION_INIT } from '../../constants/actions';

import { WindowNames, WindowMeta } from '@services/windows/WindowProperties';

const form = async (state = {}, action: any) => {
  switch (action.type) {
    case DIALOG_CODE_INJECTION_INIT: {
      const { codeInjectionType } = window.meta as WindowMeta[WindowNames.codeInjection];
      if (codeInjectionType === undefined) {
        throw new Error(`codeInjectionType is undefined`);
      }
      return {
        code: await window.service.preference.get(`${codeInjectionType}CodeInjection` as 'jsCodeInjection' | 'cssCodeInjection'),
        // allowNodeInJsCodeInjection is only used for js injection
        allowNodeInJsCodeInjection: codeInjectionType === 'js' ? await window.service.preference.get('allowNodeInJsCodeInjection') : false,
      };
    }
    case UPDATE_CODE_INJECTION_FORM:
      return { ...state, ...action.changes };
    default:
      return state;
  }
};

export default combineReducers({ form });
