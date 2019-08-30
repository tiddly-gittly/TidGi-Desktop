import { SET_PREFERENCE } from '../../constants/actions';

export const setPreference = (name, value) => (dispatch) => {
  dispatch({
    type: SET_PREFERENCE,
    name,
    value,
  });
};
