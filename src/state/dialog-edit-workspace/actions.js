import { UPDATE_EDIT_WORKSPACE_FORM, DIALOG_EDIT_WORKSPACE_INIT } from '../../constants/actions';

import hasErrors from '../../helpers/has-errors';
import isUrl from '../../helpers/is-url';
import validate from '../../helpers/validate';

import { requestSetWorkspace, requestSetWorkspacePicture, requestRemoveWorkspacePicture } from '../../senders';

const getValidationRules = () => ({
  name: {
    fieldName: 'Name',
    required: true,
  },
  port: {
    fieldName: 'Port',
    required: true,
  },
  homeUrl: {
    fieldName: 'Home URL',
    required: true,
    lessStrictUrl: true,
  },
});

export const init = () => ({
  type: DIALOG_EDIT_WORKSPACE_INIT,
});

export const updateForm = changes => dispatch => {
  dispatch({
    type: UPDATE_EDIT_WORKSPACE_FORM,
    changes: validate(changes, getValidationRules()),
  });
};

export const save = () => (dispatch, getState) => {
  const { form } = getState().dialogEditWorkspace;

  const validatedChanges = validate(form, getValidationRules());
  if (hasErrors(validatedChanges)) {
    return dispatch(updateForm(validatedChanges));
  }

  const id = window.remote.getGlobal('editWorkspaceId');
  const url = form.homeUrl.trim();
  const homeUrl = isUrl(url) ? url : `http://${url}`;

  requestSetWorkspace(id, {
    name: form.name,
    port: form.port,
    tagName: form.tagName,
    homeUrl,
    // prefs
    disableAudio: Boolean(form.disableAudio),
    disableNotifications: Boolean(form.disableNotifications),
    hibernateWhenUnused: Boolean(form.hibernateWhenUnused),
    transparentBackground: Boolean(form.transparentBackground),
  });

  if (form.picturePath) {
    requestSetWorkspacePicture(id, form.picturePath);
  } else if (form.internetIcon) {
    requestSetWorkspacePicture(id, form.internetIcon);
  } else {
    requestRemoveWorkspacePicture(id);
  }

  window.remote.closeCurrentWindow();
  return null;
};
