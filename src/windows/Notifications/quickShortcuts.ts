import { t } from '@services/libs/i18n/placeholder';
import { addDays, addHours, addMinutes, addWeeks } from 'date-fns';

/**
 * Quick shortcuts for pausing notifications
 * The name keys are used for i18n translation
 */
export interface IQuickShortcut {
  name: string;
  key: string;
  calcDate: () => Date;
}

export const quickShortcuts: IQuickShortcut[] = [
  {
    name: '15 minutes',
    key: t('Notification.Pause15Minutes'),
    calcDate: () => addMinutes(new Date(), 15),
  },
  {
    name: '30 minutes',
    key: t('Notification.Pause30Minutes'),
    calcDate: () => addMinutes(new Date(), 30),
  },
  {
    name: '45 minutes',
    key: t('Notification.Pause45Minutes'),
    calcDate: () => addMinutes(new Date(), 45),
  },
  {
    name: '1 hour',
    key: t('Notification.Pause1Hour'),
    calcDate: () => addHours(new Date(), 1),
  },
  {
    name: '2 hours',
    key: t('Notification.Pause2Hours'),
    calcDate: () => addHours(new Date(), 2),
  },
  {
    name: '4 hours',
    key: t('Notification.Pause4Hours'),
    calcDate: () => addHours(new Date(), 4),
  },
  {
    name: '6 hours',
    key: t('Notification.Pause6Hours'),
    calcDate: () => addHours(new Date(), 6),
  },
  {
    name: '8 hours',
    key: t('Notification.Pause8Hours'),
    calcDate: () => addHours(new Date(), 8),
  },
  {
    name: '10 hours',
    key: t('Notification.Pause10Hours'),
    calcDate: () => addHours(new Date(), 10),
  },
  {
    name: '12 hours',
    key: t('Notification.Pause12Hours'),
    calcDate: () => addHours(new Date(), 12),
  },
  {
    name: 'Until tomorrow',
    key: t('Notification.PauseUntilTomorrow'),
    calcDate: () => addDays(new Date(), 1),
  },
  {
    name: 'Until next week',
    key: t('Notification.PauseUntilNextWeek'),
    calcDate: () => addWeeks(new Date(), 1),
  },
];
