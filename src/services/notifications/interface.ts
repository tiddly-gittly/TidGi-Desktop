import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
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
