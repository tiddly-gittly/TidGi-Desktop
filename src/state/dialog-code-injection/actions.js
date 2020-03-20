
import { UPDATE_CODE_INJECTION_FORM, DIALOG_CODE_INJECTION_INIT } from '../../constants/actions';
import { requestSetPreference, requestShowRequireRestartDialog } from '../../senders';

export const init = () => ({
  type: DIALOG_CODE_INJECTION_INIT,
});

export const updateForm = (changes) => (dispatch) => dispatch({
  type: UPDATE_CODE_INJECTION_FORM,
  changes,
});

export const save = () => (dispatch, getState) => {
  const { form } = getState().dialogCodeInjection;
  const { remote } = window.require('electron');

  const codeInjectionType = remote.getGlobal('codeInjectionType');
  requestSetPreference(`${codeInjectionType}CodeInjection`, form.code);

  requestShowRequireRestartDialog();

  remote.getCurrentWindow().close();
};
