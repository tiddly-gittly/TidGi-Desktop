import { UPDATE_PAUSE_NOTIFICATIONS_INFO } from '../../constants/actions';

export const updatePauseNotificationsInfo = (pauseNotificationsInfo) => ({
  type: UPDATE_PAUSE_NOTIFICATIONS_INFO,
  pauseNotificationsInfo,
});
