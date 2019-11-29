import { combineReducers } from 'redux';

import { UPDATE_PAUSE_NOTIFICATIONS_INFO } from '../../constants/actions';

import { getPauseNotificationsInfo } from '../../senders';

const pauseNotificationsInfo = (state = getPauseNotificationsInfo(), action) => {
  switch (action.type) {
    case UPDATE_PAUSE_NOTIFICATIONS_INFO: {
      return action.pauseNotificationsInfo;
    }
    default:
      return state;
  }
};

export default combineReducers({ pauseNotificationsInfo });
