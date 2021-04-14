import { useCallback, useEffect, useMemo } from 'react';
import AuthingSSO, { ITrackSessionResult } from '@authing/sso';
import { ServiceTokenTypes, ServiceUserNameTypes, ServiceEmailTypes } from '@services/auth/interface';
import { SupportedStorageServices, IAuthingUserInfo } from '@services/types';
import { APP_ID, APP_DOMAIN } from '@/constants/auth';
import { usePromiseValueAndSetter } from '@/helpers/useServiceValue';

export function useTokenFromAuthingRedirect(authing: AuthingSSO, callback?: () => void): void {
  const onLoginSuccessResponse = useCallback(
    async (response: ITrackSessionResult) => {
      // DEBUG: console
      console.log(`response`, response);
      if (!('userInfo' in response)) return;
      const accessTokenToSet = response?.userInfo?.thirdPartyIdentity?.accessToken;
      const provider = response?.userInfo?.thirdPartyIdentity?.provider as SupportedStorageServices;
      if (accessTokenToSet !== undefined && provider !== undefined) {
        if (!Object.values(SupportedStorageServices).includes(provider)) {
          throw new Error(`${provider} not in SupportedStorageServices`);
        }
        // DEBUG: console
        console.log(`provider`, provider);
        const authDataString = response?.userInfo?.oauth;
        // all data we need
        if (accessTokenToSet !== undefined && authDataString !== undefined) {
          const authData = JSON.parse(authDataString);
          // DEBUG: console
          console.log(`authData`, authData);
          const nextUserInfo: IAuthingUserInfo = {
            ...response.userInfo,
            ...authData,
            ...response.userInfo?.thirdPartyIdentity,
          };
          await Promise.all([
            window.service.auth.set(`${provider}-token` as ServiceTokenTypes, accessTokenToSet),
            window.service.auth.set(`${provider}-userName` as ServiceUserNameTypes, nextUserInfo.username),
            window.service.auth.set(`${provider}-email` as ServiceEmailTypes, nextUserInfo.email),
          ]);
          callback?.();
        }
      }
    },
    [callback],
  );

  const onClickLogout = useCallback(async () => {
    const { code, message } = await authing.logout();
    await window.service.window.clearStorageData();
    // DEBUG: console
    console.log(`{ code, message }`, { code, message });
    if (code === 200) {
      // TODO: clear the input
    } else {
      throw new Error(message);
    }
  }, [authing]);

  // after authing redirect to 3rd party page and success, it will redirect back, we then check if login is success on component mount
  useEffect(() => {
    void (async () => {
      const response = await authing.trackSession();
      // we logout so login into github won't block use from login into gitlab
      await onClickLogout();
      const isLogin = response?.session !== undefined && response?.session !== null;
      if (isLogin) {
        await onLoginSuccessResponse(response);
      }
    })();
  }, [authing, onLoginSuccessResponse, onClickLogout]);
}

export function useAuthing(): AuthingSSO {
  const authing = useMemo(
    () =>
      new AuthingSSO({
        appId: APP_ID,
        appDomain: APP_DOMAIN,
        redirectUrl: 'http://localhost:3000',
      }),
    [],
  );

  return authing;
}
