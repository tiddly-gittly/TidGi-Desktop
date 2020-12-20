import { UPDATE_UPDATER } from '../../constants/actions';

export const updateUpdater = (updaterObject: any) => ({
  type: UPDATE_UPDATER,
  updaterObj: updaterObject,
});
