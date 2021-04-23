import type { NotificationConstructorOptions } from 'electron';
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { NotificationChannel } from '@/constants/channels';
import { BehaviorSubject } from 'rxjs';

export interface IPauseNotificationsInfo {
  reason: string;
  tilDate: Date;
  schedule: { from: Date; to: Date };
}

/**
 * Preference and method about notification, to set and pause notification.
 */
export interface INotificationService {
  pauseNotificationsInfo$: BehaviorSubject<IPauseNotificationsInfo | undefined>;
  show(options: NotificationConstructorOptions): Promise<void>;
  updatePauseNotificationsInfo(): Promise<void>;
  getPauseNotificationsInfo: () => Promise<IPauseNotificationsInfo | undefined>;
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
