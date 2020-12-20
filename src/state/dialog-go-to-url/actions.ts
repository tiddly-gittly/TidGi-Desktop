import { UPDATE_GO_TO_URL_FORM } from '../../constants/actions';
import hasErrors from '../../helpers/has-errors';
import isUrl from '../../helpers/is-url';
import validate from '../../helpers/validate';
import { requestLoadUrl } from '../../senders';

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

  // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
  requestLoadUrl(finalUrl);
  window.remote.closeCurrentWindow();
  return null;
};
