import { UPDATE_AUTH_FORM } from '../../constants/actions';

import { requestValidateAuthIdentity } from '../../senders';

export const updateForm = (changes: any) => (dispatch: any) =>
  dispatch({
    type: UPDATE_AUTH_FORM,
    changes,
  });

export const login = () => (dispatch: any, getState: any) => {
  const { form } = getState().dialogAuth;

  const { username, password } = form;

  requestValidateAuthIdentity(window.remote.getCurrentWindowID(), username, password);
};
