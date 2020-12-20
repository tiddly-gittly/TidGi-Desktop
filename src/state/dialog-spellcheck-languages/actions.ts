import { DIALOG_SPELLCHECK_LANGUAGES_INIT, DIALOG_SPELLCHECK_LANGUAGES_UPDATE_FORM } from '../../constants/actions';
import { requestSetPreference, requestShowRequireRestartDialog } from '../../senders';

export const init = () => ({
  type: DIALOG_SPELLCHECK_LANGUAGES_INIT,
});

export const updateForm = (changes: any) => (dispatch: any) =>
  dispatch({
    type: DIALOG_SPELLCHECK_LANGUAGES_UPDATE_FORM,
    changes,
  });

export const addLanguage = (code: any) => (dispatch: any, getState: any) => {
  const { spellcheckLanguages } = getState().dialogSpellcheckLanguages.form;
  if (!spellcheckLanguages.includes(code)) {
    dispatch(
      updateForm({
        spellcheckLanguages: [...spellcheckLanguages, code],
      }),
    );
  }
};

export const removeLanguage = (code: any) => (dispatch: any, getState: any) => {
  const { spellcheckLanguages } = getState().dialogSpellcheckLanguages.form;
  const filteredSpellCheckerLanguages = spellcheckLanguages.filter((lang: any) => lang !== code);
  dispatch(
    updateForm({
      spellcheckLanguages: filteredSpellCheckerLanguages,
    }),
  );
};

export const save = () => (dispatch: any, getState: any) => {
  const { form } = getState().dialogSpellcheckLanguages;

  requestSetPreference('spellcheckLanguages', form.spellcheckLanguages);

  requestShowRequireRestartDialog();

  window.remote.closeCurrentWindow();
};
