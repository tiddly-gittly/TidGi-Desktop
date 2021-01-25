import { UPDATE_CUSTOM_USER_AGENT_FORM, DIALOG_CUSTOM_USER_AGENT_INIT } from '../../constants/actions';

export const init = () => ({
  type: DIALOG_CUSTOM_USER_AGENT_INIT,
});

export const updateForm = (changes: any) => (dispatch: any) =>
  dispatch({
    type: UPDATE_CUSTOM_USER_AGENT_FORM,
    changes,
  });

export const save = () => async (dispatch: any, getState: any) => {
  const { form } = getState().dialogCustomUserAgent;

  if ((await window.service.preference.get('customUserAgent')) !== form.code) {
    await window.service.preference.set('customUserAgent', form.code);
    requestShowRequireRestartDialog();
  }

  window.remote.closeCurrentWindow();
};
