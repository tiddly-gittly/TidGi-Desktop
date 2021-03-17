import { useObservable } from 'beautiful-react-hooks';
import { useState } from 'react';
import { IUserInfos } from './interface';

export function useUserInfoObservable(): IUserInfos | undefined {
  const [userInfo, userInfoSetter] = useState<IUserInfos | undefined>();
  useObservable<IUserInfos | undefined>(window.observables.auth.userInfo$, userInfoSetter);
  return userInfo;
}
