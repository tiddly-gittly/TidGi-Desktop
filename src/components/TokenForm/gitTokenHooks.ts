/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { APP_DOMAIN, APP_ID } from '@/constants/auth';
import { SupportedStorageServices } from '@services/types';
import { AuthenticationClient } from 'authing-js-sdk';
import { useCallback, useMemo } from 'react';

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
              await window.service.auth.set(`${storageService}-token`, thirdPartyIdentity.accessToken);
            }
            if (user.username) {
              await window.service.auth.set(`${storageService}-userName`, user.username);
            }
            if (user.email) {
              await window.service.auth.set(`${storageService}-email`, user.email);
            }
          }
        },
        onError: (code, message) => {
          onFailure(new Error(message + String(code)));
        },
      });
    } catch (error) {
      onFailure(error as Error);
    }
  }, [authing.social, onFailure, storageService]);

  return [onClickLogin, onClickLogout];
}
