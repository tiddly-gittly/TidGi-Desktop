/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useCallback, useEffect, useMemo } from 'react';
import AuthingSSO, { ITrackSessionResult } from '@authing/sso';
import { AuthenticationClient } from 'authing-js-sdk';
import { ServiceTokenTypes, ServiceUserNameTypes, ServiceEmailTypes } from '@services/auth/interface';
import { SupportedStorageServices, IAuthingUserInfo } from '@services/types';
import { APP_ID, APP_DOMAIN } from '@/constants/auth';

export function useAuth(storageService: SupportedStorageServices): [() => Promise<void>, () => Promise<void>] {
  const authing = useMemo(
    () =>
      new AuthenticationClient({
        appId: APP_ID,
        appHost: APP_DOMAIN,
      }),
    [],
  );

  const onFailure = useCallback((error: Error) => {
    console.error(error);
  }, []);
  const onClickLogout = useCallback(async () => {
    await authing.logout();
    await window.service.window.clearStorageData();
  }, [authing]);

  const onClickLogin = useCallback(async () => {
    // clear token first, otherwise github login window won't give us a chance to see the form
    // void this.auth.logout();
    // window.remote.clearStorageData();
    try {
      await authing.social.authorize(storageService, {
        onSuccess: async (user) => {
          const thirdPartyIdentity = user.identities?.find((identity) => identity?.provider === storageService);
          if (thirdPartyIdentity) {
            if (thirdPartyIdentity.accessToken) {
              await window.service.auth.set(`${storageService}-token` as ServiceTokenTypes, thirdPartyIdentity.accessToken);
            }
            if (user.username) {
              await window.service.auth.set(`${storageService}-userName` as ServiceUserNameTypes, user.username);
            }
            if (user.email) {
              await window.service.auth.set(`${storageService}-email` as ServiceEmailTypes, user.email);
            }
          }
        },
        onError: (code, message) => onFailure(new Error(message + String(code))),
      });
    } catch (error) {
      onFailure(error);
    }
  }, [authing.social, onFailure, storageService]);

  return [onClickLogin, onClickLogout];
}
