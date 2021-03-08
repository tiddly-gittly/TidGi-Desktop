import type { NotificationConstructorOptions } from 'electron';
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { NotificationChannel } from '@/constants/channels';
import { Subject } from 'rxjs';

export interface IPauseNotificationsInfo {
  reason: string;
  tilDate: Date;
  schedule: { from: Date; to: Date };
}

/**
 * Preference and method about notification, to set and pause notification.
 */
export interface INotificationService {
  pauseNotificationsInfo$: Subject<IPauseNotificationsInfo>;
  show(options: NotificationConstructorOptions): void;
  updatePauseNotificationsInfo(): void;
  getPauseNotificationsInfo: () => IPauseNotificationsInfo | undefined;
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
