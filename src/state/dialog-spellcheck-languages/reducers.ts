import { combineReducers } from 'redux';

import {
  DIALOG_SPELLCHECK_LANGUAGES_INIT,
  DIALOG_SPELLCHECK_LANGUAGES_UPDATE_FORM,
} from '../../constants/actions';

import { getPreference } from '../../senders';

const form = (state = {}, action) => {
  switch (action.type) {
    case DIALOG_SPELLCHECK_LANGUAGES_INIT: {
      return {
        spellcheckLanguages: getPreference('spellcheckLanguages'),
      };
    }
    case DIALOG_SPELLCHECK_LANGUAGES_UPDATE_FORM: return { ...state, ...action.changes };
    default: return state;
  }
};

export default combineReducers({ form });
