
import { UPDATE_EDIT_WORKSPACE_FORM } from '../../constants/actions';

import validate from '../../helpers/validate';
import hasErrors from '../../helpers/has-errors';

import {
  requestSetWorkspace,
  requestSetWorkspacePicture,
  requestRemoveWorkspacePicture,
} from '../../senders';

const { remote } = window.require('electron');

const getValidationRules = () => ({
  name: {
    fieldName: 'Name',
    required: true,
  },
  homeUrl: {
    fieldName: 'Home URL',
    required: true,
    url: true,
  },
});

export const updateForm = (changes) => ({
  type: UPDATE_EDIT_WORKSPACE_FORM,
  changes: validate(changes, getValidationRules()),
});

export const save = () => (dispatch, getState) => {
  const { form } = getState().editWorkspace;

  const validatedChanges = validate(form, getValidationRules());
  if (hasErrors(validatedChanges)) {
    return dispatch(updateForm(validatedChanges));
  }

  const id = remote.getGlobal('editWorkspaceId');

  requestSetWorkspace(
    id,
    {
      name: form.name,
      homeUrl: form.homeUrl.trim(),
      hibernateWhenUnused: Boolean(form.hibernateWhenUnused),
    },
  );

  if (form.picturePath) {
    requestSetWorkspacePicture(id, form.picturePath);
  } else {
    requestRemoveWorkspacePicture(id);
  }

  remote.getCurrentWindow().close();
  return null;
};
