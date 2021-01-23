import { UPDATE_CODE_INJECTION_FORM, DIALOG_CODE_INJECTION_INIT } from '../../constants/actions';
import { requestSetPreference, requestShowRequireRestartDialog } from '../../senders';

import { WindowNames, WindowMeta } from '@services/windows/WindowProperties';

export const init = () => ({
  type: DIALOG_CODE_INJECTION_INIT,
});

export const updateForm = (changes: any) => (dispatch: any) =>
  dispatch({
    type: UPDATE_CODE_INJECTION_FORM,
    changes,
  });

export const save = () => (dispatch: any, getState: any) => {
  const { form } = getState().dialogCodeInjection;

  const { codeInjectionType } = window.meta as WindowMeta[WindowNames.codeInjection];

  requestSetPreference(`${codeInjectionType}CodeInjection`, form.code);
  if (codeInjectionType === 'js' && typeof form.allowNodeInJsCodeInjection === 'boolean') {
    requestSetPreference('allowNodeInJsCodeInjection', form.allowNodeInJsCodeInjection);
  }

  requestShowRequireRestartDialog();

  window.remote.closeCurrentWindow();
};
