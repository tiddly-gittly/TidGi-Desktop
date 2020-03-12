import {
  UPDATE_PAUSE_NOTIFICATIONS_INFO,
  UPDATE_SHOW_DATE_TIME_PICKER,
} from '../../constants/actions';

export const updateShowDateTimePicker = (showDateTimePicker) => ({
  type: UPDATE_SHOW_DATE_TIME_PICKER,
  showDateTimePicker,
});

export const updatePauseNotificationsInfo = (pauseNotificationsInfo) => ({
  type: UPDATE_PAUSE_NOTIFICATIONS_INFO,
  pauseNotificationsInfo,
});
