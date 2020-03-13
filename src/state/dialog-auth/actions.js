
import { UPDATE_AUTH_FORM } from '../../constants/actions';

import { requestValidateAuthIdentity } from '../../senders';

const { remote } = window.require('electron');

export const updateForm = (changes) => (dispatch) => dispatch({
  type: UPDATE_AUTH_FORM,
  changes,
});

export const login = () => (dispatch, getState) => {
  const { form } = getState().dialogAuth;

  const { username, password } = form;

  requestValidateAuthIdentity(remote.getCurrentWindow().id, username, password);
};
