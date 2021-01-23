import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { injectable, inject } from 'inversify';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IPreferenceService } from '@services/preferences';
import type { IViewService } from '@services/view';
import { NotificationChannel } from '@/constants/channels';

export interface IPauseNotificationsInfo {
  reason: string;
  tilDate: Date;
  schedule: { from: Date; to: Date };
}

/**
 * Preference and method about notification, to set and pause notification.
 */
export interface INotificationService {
  updatePauseNotificationsInfo(): void;
  getPauseNotificationsInfo: () => IPauseNotificationsInfo | undefined;
}
export const NotificationServiceIPCDescriptor = {
  channel: NotificationChannel.name,
  properties: {
    updatePauseNotificationsInfo: ProxyPropertyType.Function,
    getPauseNotificationsInfo: ProxyPropertyType.Function,
  },
};
@injectable()
export class Notification implements INotificationService {
  constructor(
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
    @inject(serviceIdentifier.View) private readonly viewService: IViewService,
  ) {}

  private pauseNotificationsInfo?: IPauseNotificationsInfo;

  private getCurrentScheduledDateTime(): { from: Date; to: Date } | undefined {
    const pauseNotificationsBySchedule = this.preferenceService.get('pauseNotificationsBySchedule');
    const pauseNotificationsByScheduleFrom = this.preferenceService.get('pauseNotificationsByScheduleFrom');
    const pauseNotificationsByScheduleTo = this.preferenceService.get('pauseNotificationsByScheduleTo');

    if (!pauseNotificationsBySchedule) return;

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
        to.setMinutes(mockToDate.getMinutes()); // til 7 AM of tomorrow
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
  }

  /**
   * return reason why notifications are paused
   */
  private calcPauseNotificationsInfo(): IPauseNotificationsInfo | undefined {
    const pauseNotifications = this.preferenceService.get('pauseNotifications');

    const schedule = this.getCurrentScheduledDateTime();

    const currentDate = new Date();

    if (typeof pauseNotifications === 'string') {
      // overwrite schedule
      if (pauseNotifications.startsWith('resume:')) {
        const overwriteTilDate = new Date(pauseNotifications.slice(7));
        if (overwriteTilDate >= currentDate) {
          return;
        }
      }

      // normal pause (without scheduling)
      if (schedule !== undefined && pauseNotifications.startsWith('pause:')) {
        const tilDate = new Date(pauseNotifications.slice(6));
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
    if (schedule !== undefined && currentDate >= schedule.from && currentDate <= schedule.to) {
      return {
        reason: 'scheduled',
        tilDate: schedule.to,
        schedule,
      };
    }
  }

  private timeouts: NodeJS.Timeout[] = [];
  /* lock to avoid multiple timeouts running at the same time */
  private updating = false;
  public updatePauseNotificationsInfo(): void {
    if (this.updating) return;
    this.updating = true;

    this.pauseNotificationsInfo = this.calcPauseNotificationsInfo();

    // Send update to webview
    const shouldPauseNotifications = this.pauseNotificationsInfo !== null;
    const shouldMuteAudio = shouldPauseNotifications && this.preferenceService.get('pauseNotificationsMuteAudio');
    this.viewService.setViewsAudioPref(shouldMuteAudio);
    this.viewService.setViewsNotificationsPref(shouldPauseNotifications);
    // FIXME: sync state to the UI
    // sendToAllWindows('should-pause-notifications-changed', this.pauseNotificationsInfo);

    // set schedule for reupdating
    const pauseNotifications = this.preferenceService.get('pauseNotifications');
    const schedule = this.getCurrentScheduledDateTime();

    // clear old timeouts
    this.timeouts.forEach((timeout: NodeJS.Timeout) => {
      clearTimeout(timeout);
    });

    this.timeouts = [];

    // create new update timeout
    const addTimeout = (d: Date): void => {
      const t = new Date(d).getTime() - new Date().getTime();
      // https://github.com/nodejs/node-v0.x-archive/issues/8656
      if (t > 0 && t < 2147483647) {
        const newTimeout = setTimeout(() => {
          this.updatePauseNotificationsInfo();
        }, t);
        this.timeouts.push(newTimeout);
      }
    };
    if (typeof pauseNotifications === 'string' && pauseNotifications.length > 0) {
      if (pauseNotifications.startsWith('resume:')) {
        addTimeout(new Date(pauseNotifications.slice(7)));
      }
      if (pauseNotifications.startsWith('pause:')) {
        addTimeout(new Date(pauseNotifications.slice(6)));
      }
    }
    if (schedule !== undefined) {
      addTimeout(schedule.from);
      addTimeout(schedule.to);
    }

    this.updating = false;
  }

  public getPauseNotificationsInfo = (): IPauseNotificationsInfo | undefined => this.pauseNotificationsInfo;
}
