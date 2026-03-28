import NotificationsIcon from '@mui/icons-material/Notifications';
import { z } from 'zod';
import type { ISectionDefinition } from './types';

export const notificationsSection: ISectionDefinition = {
  id: 'notifications',
  titleKey: 'Preference.Notifications',
  Icon: NotificationsIcon,
  items: [
    {
      type: 'action',
      titleKey: 'Preference.NotificationsDetail',
      handler: 'window.open',
      args: ['notifications'],
    },
    { type: 'divider' },
    {
      type: 'custom',
      titleKey: 'Preference.NotificationsDisableSchedule',
      componentId: 'notifications.schedule',
    },
    { type: 'divider' },
    {
      type: 'preference-boolean',
      key: 'pauseNotificationsMuteAudio',
      titleKey: 'Preference.NotificationsMuteAudio',
      zod: z.boolean(),
    },
    { type: 'divider' },
    {
      type: 'preference-boolean',
      key: 'unreadCountBadge',
      titleKey: 'Preference.UnreadCountBadge',
      needsRestart: true,
      zod: z.boolean(),
    },
    { type: 'divider' },
    {
      type: 'custom',
      titleKey: 'Preference.TestNotification',
      componentId: 'notifications.test',
    },
    { type: 'divider' },
    {
      type: 'custom',
      titleKey: 'Preference.HowToEnableNotifications',
      componentId: 'notifications.helpText',
    },
  ],
};
