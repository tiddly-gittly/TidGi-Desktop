const mainWindow = require('../windows/main');
const { getPreference } = require('./preferences');
const sendToAllWindows = require('./send-to-all-windows');

let pauseNotificationsInfo;

const getCurrentScheduledDateTime = () => {
  const pauseNotificationsBySchedule = getPreference('pauseNotificationsBySchedule');
  const pauseNotificationsByScheduleFrom = getPreference('pauseNotificationsByScheduleFrom');
  const pauseNotificationsByScheduleTo = getPreference('pauseNotificationsByScheduleTo');

  if (!pauseNotificationsBySchedule) return null;

  const mockFromDate = new Date(pauseNotificationsByScheduleFrom);
  const mockToDate = new Date(pauseNotificationsByScheduleTo);
  const currentDate = new Date();
  // convert to minute for easy calculation
  const fromMinute = mockFromDate.getHours() * 60 + mockFromDate.getMinutes();
  const toMinute = mockToDate.getHours() * 60 + mockToDate.getMinutes();
  const currentMinute = currentDate.getHours() * 60 + currentDate.getMinutes();

  // pause notifications from 8 AM to 7 AM
  // means pausing from 8 AM to midnight (today), midnight to 7 AM (next day)
  // or means pausing from 8 AM to midnight (yesterday), midnight to 7 AM (today)
  if (fromMinute > toMinute) {
    if (currentMinute >= fromMinute && currentMinute <= 23 * 60 + 59) {
      const from = new Date();
      from.setHours(mockFromDate.getHours());
      from.setMinutes(mockFromDate.getMinutes()); // from 8 AM of the current day

      const to = new Date();
      to.setDate(to.getDate() + 1);
      to.setHours(mockToDate.getHours());
      to.setMinutes(mockToDate.getMinutes()); // til 7 AM of tommorow
      return { from, to };
    }
    if (currentMinute >= 0 && currentMinute <= toMinute) {
      const from = new Date();
      from.setDate(from.getDate() - 1);
      from.setHours(mockFromDate.getHours());
      from.setMinutes(mockFromDate.getMinutes()); // from 8 AM of yesterday

      const to = new Date();
      to.setHours(mockToDate.getHours());
      to.setMinutes(mockToDate.getMinutes()); // til 7 AM of today
      return { from, to };
    }
  }

  // pause notification from 7 AM to 8 AM
  // means pausing from 7 AM to 8 AM of today
  if (fromMinute <= toMinute) {
    if (currentMinute >= fromMinute && currentMinute <= toMinute) {
      const from = new Date();
      from.setDate(from.getDate());
      from.setHours(mockFromDate.getHours());
      from.setMinutes(mockFromDate.getMinutes()); // from 8 AM of today

      const to = new Date();
      to.setDate(to.getDate());
      to.setHours(mockToDate.getHours());
      to.setMinutes(mockToDate.getMinutes()); // til 8 AM of today
      return { from, to };
    }
  }

  return null;
};

// return reason why notifications are paused
const calcPauseNotificationsInfo = () => {
  const pauseNotifications = getPreference('pauseNotifications');

  const schedule = getCurrentScheduledDateTime();

  const currentDate = new Date();

  if (typeof pauseNotifications === 'string') {
    // overwrite schedule
    if (pauseNotifications.startsWith('resume:')) {
      const overwriteTilDate = new Date(pauseNotifications.substring(7));
      if (overwriteTilDate >= currentDate) {
        return null;
      }
    }

    // normal pause (without scheduling)
    if (pauseNotifications.startsWith('pause:')) {
      const tilDate = new Date(pauseNotifications.substring(6));
      if (tilDate >= currentDate) {
        return {
          reason: 'non-scheduled',
          tilDate,
          schedule,
        };
      }
    }
  }

  // check schedule
  if (schedule && currentDate >= schedule.from && currentDate <= schedule.to) {
    return {
      reason: 'scheduled',
      tilDate: schedule.to,
      schedule,
    };
  }

  return null;
};

let timeouts = [];
let updating = false;
const updatePauseNotificationsInfo = () => {
  // avoid multiple timeouts running at the same time
  if (updating) return;
  updating = true;

  pauseNotificationsInfo = calcPauseNotificationsInfo();

  // Send update to webview
  const shouldPauseNotifications = pauseNotificationsInfo !== null;
  const shouldMuteAudio = shouldPauseNotifications && getPreference('pauseNotificationsMuteAudio');
  const views = mainWindow.get().getBrowserViews();
  if (views) {
    views.forEach((view) => {
      view.webContents.send('should-pause-notifications-changed', shouldPauseNotifications);
      view.webContents.setAudioMuted(shouldMuteAudio);
    });
  }
  sendToAllWindows('should-pause-notifications-changed', pauseNotificationsInfo);

  // set schedule for reupdating
  const pauseNotifications = getPreference('pauseNotifications');
  const schedule = getCurrentScheduledDateTime();

  // clear old timeouts
  timeouts.forEach((timeout) => {
    clearTimeout(timeout);
  });

  timeouts = [];

  // create new update timeout
  const addTimeout = (d) => {
    const t = new Date(d).getTime() - new Date().getTime();
    // https://github.com/nodejs/node-v0.x-archive/issues/8656
    if (t > 0 && t < 2147483647) {
      const newTimeout = setTimeout(() => {
        updatePauseNotificationsInfo();
      }, t);
      timeouts.push(newTimeout);
    }
  };
  if (pauseNotifications) {
    if (pauseNotifications.startsWith('resume:')) {
      addTimeout(new Date(pauseNotifications.substring(7)));
    }
    if (pauseNotifications.startsWith('pause:')) {
      addTimeout(new Date(pauseNotifications.substring(6)));
    }
  }
  if (schedule) {
    addTimeout(schedule.from);
    addTimeout(schedule.to);
  }

  updating = false;
};

const getPauseNotificationsInfo = () => pauseNotificationsInfo;

module.exports = {
  updatePauseNotificationsInfo,
  getPauseNotificationsInfo,
};
