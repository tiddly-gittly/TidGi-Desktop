import { SET_WORKSPACE } from '../../constants/actions';

export const setWorkspace = (id, value) => (dispatch) => {
  dispatch({
    type: SET_WORKSPACE,
    id,
    value,
  });
};
