import { UPDATE_CODE_INJECTION_FORM, DIALOG_CODE_INJECTION_INIT } from '../../constants/actions';

import { WindowNames, WindowMeta } from '@services/windows/WindowProperties';

export const init = () => ({
  type: DIALOG_CODE_INJECTION_INIT,
});

export const updateForm = (changes: any) => (dispatch: any) =>
  dispatch({
    type: UPDATE_CODE_INJECTION_FORM,
    changes,
  });

export const save = async () => (dispatch: any, getState: any) => {
  const { form } = getState().dialogCodeInjection;

  const { codeInjectionType } = window.meta as WindowMeta[WindowNames.codeInjection];

  void window.service.preference.set(`${codeInjectionType}CodeInjection`, form.code);
  if (codeInjectionType === 'js' && typeof form.allowNodeInJsCodeInjection === 'boolean') {
    void window.service.preference.set('allowNodeInJsCodeInjection', form.allowNodeInJsCodeInjection);
  }

  await window.service.window.requestShowRequireRestartDialog();

  window.remote.closeCurrentWindow();
};
