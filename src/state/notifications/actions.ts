import { UPDATE_PAUSE_NOTIFICATIONS_INFO, UPDATE_SHOW_DATE_TIME_PICKER } from '../../constants/actions';

export const updateShowDateTimePicker = (showDateTimePicker: any) => ({
  type: UPDATE_SHOW_DATE_TIME_PICKER,
  showDateTimePicker,
});

export const updatePauseNotificationsInfo = (pauseNotificationsInfo: any) => ({
  type: UPDATE_PAUSE_NOTIFICATIONS_INFO,
  pauseNotificationsInfo,
});
