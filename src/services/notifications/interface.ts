import { NotificationChannel } from '@/constants/channels';
import type { NotificationConstructorOptions } from 'electron';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { BehaviorSubject } from 'rxjs';

export interface IPauseNotificationsInfo {
  reason: string;
  schedule: { from: Date; to: Date };
  tilDate: Date;
}

/**
 * Preference and method about notification, to set and pause notification.
 */
export interface INotificationService {
  getPauseNotificationsInfo: () => Promise<IPauseNotificationsInfo | undefined>;
  pauseNotificationsInfo$: BehaviorSubject<IPauseNotificationsInfo | undefined>;
  show(options: NotificationConstructorOptions): Promise<void>;
  updatePauseNotificationsInfo(): Promise<void>;
}
export const NotificationServiceIPCDescriptor = {
  channel: NotificationChannel.name,
  properties: {
    pauseNotificationsInfo$: ProxyPropertyType.Value$,
    show: ProxyPropertyType.Function,
    updatePauseNotificationsInfo: ProxyPropertyType.Function,
    getPauseNotificationsInfo: ProxyPropertyType.Function,
  },
};
