import { UPDATE_UPDATER } from '../../constants/actions';

export const updateUpdater = (updaterObj) => ({
  type: UPDATE_UPDATER,
  updaterObj,
});
