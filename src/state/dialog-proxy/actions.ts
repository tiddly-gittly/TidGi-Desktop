import { DIALOG_PROXY_FORM_UPDATE, DIALOG_PROXY_INIT } from '../../constants/actions';

import validate from '../../helpers/validate';
import hasErrors from '../../helpers/has-errors';

export const init = () => ({
  type: DIALOG_PROXY_INIT,
});

const getValidationRules = (proxyType: any) => {
  if (proxyType === 'rules') {
    return {
      proxyRules: {
        fieldName: 'Proxy address',
        required: true,
      },
    };
  }
  if (proxyType === 'pacScript') {
    return {
      proxyPacScript: {
        fieldName: 'Script URL',
        required: true,
      },
    };
  }
  return {};
};

export const updateForm = (changes: any) => (dispatch: any, getState: any) => {
  const state = getState();

  const { form } = state.dialogProxy;

  // revalidate all fields if proxy type changes
  if (changes.proxyType) {
    const validatedChanges = validate({ ...form, ...changes }, getValidationRules(changes.proxyType));
    dispatch({
      type: DIALOG_PROXY_FORM_UPDATE,
      changes: validatedChanges,
    });
  } else {
    dispatch({
      type: DIALOG_PROXY_FORM_UPDATE,
      changes: validate(changes, getValidationRules(form.proxyType)),
    });
  }
};

export const save = async () => async (dispatch: any, getState: any) => {
  const state = getState();

  const { form } = state.dialogProxy;

  const validatedChanges = validate(form, getValidationRules(form.proxyType));
  if (hasErrors(validatedChanges)) {
    return dispatch(updateForm(validatedChanges));
  }

  void window.service.preference.set('proxyRules', form.proxyRules);
  void window.service.preference.set('proxyBypassRules', form.proxyBypassRules);
  void window.service.preference.set('proxyPacScript', form.proxyPacScript);
  void window.service.preference.set('proxyType', form.proxyType);
  await window.service.window.requestShowRequireRestartDialog()

  window.remote.closeCurrentWindow();
  return null;
};
