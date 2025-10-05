import useObservable from 'beautiful-react-hooks/useObservable';
import { useState } from 'react';
import type { IPauseNotificationsInfo } from './interface';

export function useNotificationInfoObservable(): IPauseNotificationsInfo | undefined {
  const [notificationInfo, notificationInfoSetter] = useState<IPauseNotificationsInfo | undefined>();
  useObservable(window.observables.notification.pauseNotificationsInfo$, notificationInfoSetter);
  return notificationInfo;
}
