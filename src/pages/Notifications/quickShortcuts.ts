/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { addDays, addHours, addMinutes, addWeeks } from 'date-fns';

export const quickShortcuts = [
  {
    name: '15 minutes',
    calcDate: () => addMinutes(new Date(), 15),
  },
  {
    name: '30 minutes',
    calcDate: () => addMinutes(new Date(), 30),
  },
  {
    name: '45 minutes',
    calcDate: () => addMinutes(new Date(), 45),
  },
  {
    name: '1 hour',
    calcDate: () => addHours(new Date(), 1),
  },
  {
    name: '2 hours',
    calcDate: () => addHours(new Date(), 2),
  },
  {
    name: '4 hours',
    calcDate: () => addHours(new Date(), 4),
  },
  {
    name: '6 hours',
    calcDate: () => addHours(new Date(), 6),
  },
  {
    name: '8 hours',
    calcDate: () => addHours(new Date(), 8),
  },
  {
    name: '10 hours',
    calcDate: () => addHours(new Date(), 8),
  },
  {
    name: '12 hours',
    calcDate: () => addHours(new Date(), 12),
  },
  {
    name: 'Until tomorrow',
    calcDate: () => addDays(new Date(), 1),
  },
  {
    name: 'Until next week',
    calcDate: () => addWeeks(new Date(), 1),
  },
];
