
import {
  DIALOG_SPELLCHECK_LANGUAGES_INIT,
  DIALOG_SPELLCHECK_LANGUAGES_UPDATE_FORM,
} from '../../constants/actions';
import { requestSetPreference, requestShowRequireRestartDialog } from '../../senders';

export const init = () => ({
  type: DIALOG_SPELLCHECK_LANGUAGES_INIT,
});

export const updateForm = (changes) => (dispatch) => dispatch({
  type: DIALOG_SPELLCHECK_LANGUAGES_UPDATE_FORM,
  changes,
});

export const addLanguage = (code) => (dispatch, getState) => {
  const { spellcheckLanguages } = getState().dialogSpellcheckLanguages.form;
  if (!spellcheckLanguages.includes(code)) {
    dispatch(updateForm({
      spellcheckLanguages: [...spellcheckLanguages, code],
    }));
  }
};

export const removeLanguage = (code) => (dispatch, getState) => {
  const { spellcheckLanguages } = getState().dialogSpellcheckLanguages.form;
  const filteredSpellCheckerLanguages = spellcheckLanguages
    .filter((lang) => lang !== code);
  dispatch(updateForm({
    spellcheckLanguages: filteredSpellCheckerLanguages,
  }));
};

export const save = () => (dispatch, getState) => {
  const { form } = getState().dialogSpellcheckLanguages;
  const { remote } = window.require('electron');

  requestSetPreference('spellcheckLanguages', form.spellcheckLanguages);

  requestShowRequireRestartDialog();

  remote.getCurrentWindow().close();
};
