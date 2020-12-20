import { SET_SYSTEM_PREFERENCE } from '../../constants/actions';

export const setSystemPreference = (name: any, value: any) => (dispatch: any) => {
  dispatch({
    type: SET_SYSTEM_PREFERENCE,
    name,
    value,
  });
};
