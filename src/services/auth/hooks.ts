import { IGitUserInfos } from '@services/git/interface';
import { SupportedStorageServices } from '@services/types';
import useObservable from 'beautiful-react-hooks/useObservable';
import { useEffect, useState } from 'react';
import { IUserInfos } from './interface';

export function useUserInfoObservable(): IUserInfos | undefined {
  const [userInfo, userInfoSetter] = useState<IUserInfos | undefined>();
  useObservable(window.observables.auth.userInfo$, userInfoSetter as any);
  return userInfo;
}

export function useStorageServiceUserInfoObservable(serviceName: SupportedStorageServices): IGitUserInfos | undefined {
  // we use this observable to trigger hook rerun
  const fullUserInfo = useUserInfoObservable();
  const [userInfo, userInfoSetter] = useState<IGitUserInfos | undefined>();
  useEffect(() => {
    void (async () => {
      const newUserInfo = await window.service.auth.getStorageServiceUserInfo(serviceName);
      userInfoSetter(newUserInfo);
    })();
  }, [serviceName, fullUserInfo]);
  return userInfo;
}
