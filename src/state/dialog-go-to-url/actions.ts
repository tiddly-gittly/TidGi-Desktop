import { UPDATE_GO_TO_URL_FORM } from '../../constants/actions';
import hasErrors from '../../helpers/has-errors';
import isUrl from '../../helpers/is-url';
import validate from '../../helpers/validate';

const getValidationRules = () => ({
  url: {
    fieldName: 'URL',
    required: true,
    lessStrictUrl: true,
  },
});

export const updateForm = (changes: any) => (dispatch: any) =>
  dispatch({
    type: UPDATE_GO_TO_URL_FORM,
    changes: validate(changes, getValidationRules()),
  });

export const go = () => (dispatch: any, getState: any) => {
  const { form } = getState().dialogGoToUrl;

  const validatedChanges = validate(form, getValidationRules());
  if (hasErrors(validatedChanges)) {
    return dispatch(updateForm(validatedChanges));
  }

  const { url } = form;
  const finalUrl = isUrl(url) ? url : `http://${url}`;

  void window.service.workspaceView.loadURL(finalUrl).then(() => {
    window.remote.closeCurrentWindow();
  })
  return null;
};
