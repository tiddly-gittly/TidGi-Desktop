import { format, isTomorrow, isToday } from 'date-fns';

export const formatDate = (date: Date): string => {
  if (isToday(date)) {
    return format(date, 'p');
  }
  if (isTomorrow(date)) {
    return `tomorrow at ${format(date, 'p')}`;
  }
  return format(date, 'PPPp');
};
