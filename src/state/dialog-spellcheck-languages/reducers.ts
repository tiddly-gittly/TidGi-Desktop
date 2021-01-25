import { combineReducers } from 'redux';

import { DIALOG_SPELLCHECK_LANGUAGES_INIT, DIALOG_SPELLCHECK_LANGUAGES_UPDATE_FORM } from '../../constants/actions';

const form = async (state = {}, action: any) => {
  switch (action.type) {
    case DIALOG_SPELLCHECK_LANGUAGES_INIT: {
      return {
        spellcheckLanguages: await window.service.preference.get('spellcheckLanguages'),
      };
    }
    case DIALOG_SPELLCHECK_LANGUAGES_UPDATE_FORM:
      return { ...state, ...action.changes };
    default:
      return state;
  }
};

export default combineReducers({ form });
