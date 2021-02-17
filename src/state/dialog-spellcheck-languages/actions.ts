import { DIALOG_SPELLCHECK_LANGUAGES_INIT, DIALOG_SPELLCHECK_LANGUAGES_UPDATE_FORM } from '../../constants/actions';

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

export const save = async () => async (dispatch: any, getState: any) => {
  const { form } = getState().dialogSpellcheckLanguages;

  void window.service.preference.set('spellcheckLanguages', form.spellcheckLanguages);

  await window.service.window.requestShowRequireRestartDialog()

  window.remote.closeCurrentWindow();
};
