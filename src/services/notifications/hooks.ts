import { useObservable } from 'beautiful-react-hooks';
import { useState } from 'react';
import { IPauseNotificationsInfo } from './interface';

export function useNotificationInfoObservable(): IPauseNotificationsInfo | undefined {
  const [notificationInfo, notificationInfoSetter] = useState<IPauseNotificationsInfo | undefined>();
  useObservable<IPauseNotificationsInfo | undefined>(window.observables.notification.pauseNotificationsInfo$, notificationInfoSetter);
  return notificationInfo;
}
