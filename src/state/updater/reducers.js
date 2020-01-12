import { UPDATE_UPDATER } from '../../constants/actions';

const updater = (state = {}, action) => {
  switch (action.type) {
    case UPDATE_UPDATER: {
      return action.updaterObj;
    }
    default:
      return state;
  }
};

export default updater;
