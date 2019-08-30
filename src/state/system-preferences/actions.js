import { SET_SYSTEM_PREFERENCE } from '../../constants/actions';

export const setSystemPreference = (name, value) => (dispatch) => {
  dispatch({
    type: SET_SYSTEM_PREFERENCE,
    name,
    value,
  });
};
