
import {
  LICENSE_REGISTRATION_FORM_UPDATE,
} from '../../constants/actions';

import validate from '../../helpers/validate';
import hasErrors from '../../helpers/has-errors';

import {
  requestSetPreference,
  requestShowMessageBox,
} from '../../senders';

const { remote } = window.require('electron');

const getValidationRules = () => ({
  licenseKey: {
    fieldName: 'License Key',
    required: true,
    licenseKey: true,
  },
});

export const updateForm = (changes) => ({
  type: LICENSE_REGISTRATION_FORM_UPDATE,
  changes: validate(changes, getValidationRules()),
});

export const register = () => (dispatch, getState) => {
  const state = getState();

  const { form } = state.dialogLicenseRegistration;

  const validatedChanges = validate(form, getValidationRules());
  if (hasErrors(validatedChanges)) {
    return dispatch(updateForm(validatedChanges));
  }

  requestSetPreference('registered', true);

  requestShowMessageBox('Registration Complete! Thank you for supporting the future development of Singlebox.');

  remote.getCurrentWindow().close();
  return null;
};
