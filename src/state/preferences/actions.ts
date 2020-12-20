import { SET_PREFERENCE } from '../../constants/actions';

export const setPreference = (name: any, value: any) => (dispatch: any) => {
  dispatch({
    type: SET_PREFERENCE,
    name,
    value,
  });
};
