/* eslint-disable @typescript-eslint/require-await */
import { lazyInject } from '@services/container';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IWindowService } from '@services/windows/interface';
import { Notification, NotificationConstructorOptions } from 'electron';
import { injectable } from 'inversify';
import { BehaviorSubject } from 'rxjs';
import type { INotificationService, IPauseNotificationsInfo } from './interface';

@injectable()
export class NotificationService implements INotificationService {
  @lazyInject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

  @lazyInject(serviceIdentifier.View)
  private readonly viewService!: IViewService;

  @lazyInject(serviceIdentifier.Window)
  private readonly windowService!: IWindowService;

  private pauseNotificationsInfo?: IPauseNotificationsInfo;
  public pauseNotificationsInfo$: BehaviorSubject<IPauseNotificationsInfo | undefined>;

  constructor() {
    this.pauseNotificationsInfo$ = new BehaviorSubject<IPauseNotificationsInfo | undefined>(this.pauseNotificationsInfo);
  }

  private updateNotificationsInfoSubject(): void {
    this.pauseNotificationsInfo$.next(this.pauseNotificationsInfo);
  }

  public async show(options: NotificationConstructorOptions): Promise<void> {
    if (Notification.isSupported()) {
      const notification = new Notification(options);
      notification.show();
    }
  }

  private async getCurrentScheduledDateTime(): Promise<{ from: Date; to: Date } | undefined> {
    const pauseNotificationsBySchedule = await this.preferenceService.get('pauseNotificationsBySchedule');
    const pauseNotificationsByScheduleFrom = await this.preferenceService.get('pauseNotificationsByScheduleFrom');
    const pauseNotificationsByScheduleTo = await this.preferenceService.get('pauseNotificationsByScheduleTo');

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
    if (fromMinute <= toMinute && currentMinute >= fromMinute && currentMinute <= toMinute) {
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

  /**
   * return reason why notifications are paused
   */
  private async calcPauseNotificationsInfo(): Promise<IPauseNotificationsInfo | undefined> {
    const pauseNotifications = await this.preferenceService.get('pauseNotifications');

    const schedule = await this.getCurrentScheduledDateTime();

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
  public async updatePauseNotificationsInfo(): Promise<void> {
    if (this.updating) return;
    this.updating = true;

    this.pauseNotificationsInfo = await this.calcPauseNotificationsInfo();

    // Send update to webview
    const shouldPauseNotifications = this.pauseNotificationsInfo !== undefined;
    const shouldMuteAudio = shouldPauseNotifications && (await this.preferenceService.get('pauseNotificationsMuteAudio'));
    this.viewService.setViewsAudioPref(shouldMuteAudio);
    this.viewService.setViewsNotificationsPref(shouldPauseNotifications);

    // set schedule for re-updating
    const pauseNotifications = await this.preferenceService.get('pauseNotifications');
    const schedule = await this.getCurrentScheduledDateTime();

    // clear old timeouts
    this.timeouts.forEach((timeout: NodeJS.Timeout) => {
      clearTimeout(timeout);
    });

    this.timeouts = [];

    // create new update timeout
    const addTimeout = (d: Date): void => {
      const t = new Date(d).getTime() - Date.now();
      // https://github.com/nodejs/node-v0.x-archive/issues/8656
      if (t > 0 && t < 2_147_483_647) {
        const newTimeout = setTimeout(() => {
          void this.updatePauseNotificationsInfo();
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
    this.updateNotificationsInfoSubject();
  }

  public getPauseNotificationsInfo = async (): Promise<IPauseNotificationsInfo | undefined> => this.pauseNotificationsInfo;
}
