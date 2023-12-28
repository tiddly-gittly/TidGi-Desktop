/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { IGitUserInfosWithoutToken } from '@services/git/interface';
import { SupportedStorageServices } from '@services/types';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { useCallback, useEffect, useState } from 'react';

export function useAuth(storageService: SupportedStorageServices, userInfo: IGitUserInfosWithoutToken): [() => Promise<void>, () => Promise<void>] {
  const [userManager, setUserManager] = useState<UserManager>();

  useEffect(() => {
    void window.service.context.get('LOGIN_REDIRECT_PATH').then( (LOGIN_REDIRECT_PATH) => {
      const settings = {
        authority: 'https://github.com/',
        client_id: userInfo.gitUserName,
        redirect_uri: LOGIN_REDIRECT_PATH,
        response_type: 'code',
        scope: 'openid',
        // post_logout_redirect_uri: '<YOUR_POST_LOGOUT_REDIRECT_URI>',
        userStore: new WebStorageStateStore({ store: window.localStorage }),
      };

      const userManager = new UserManager(settings);
      setUserManager(userManager);

      userManager.events.addUserLoaded(async user => {
        // Handle the loaded user information here
        // Save the access token and other user details
        if (user.access_token) {
          await window.service.auth.set(`${storageService}-token`, user.access_token);
        }
        if (userInfo.gitUserName) {
          await window.service.auth.set(`${storageService}-userName`, userInfo.gitUserName);
        }
        if (userInfo.email) {
          await window.service.auth.set(`${storageService}-email`, userInfo.email);
        }
        // Additional user information might be available in the user.profile object
      });

      userManager.events.addSilentRenewError(error => {
        console.error('Silent renew error', error);
      });

      // userManager.events.addUserSignedOut(async () => {
      //   // Handle user sign-out event
      //   await window.service.window.clearStorageData();
      // });
    });
  }, [storageService, userInfo.email, userInfo.gitUserName]);

  const onClickLogin = useCallback(async () => {
    try {
      await userManager?.signinRedirect();
    } catch (error) {
      console.error(error);
    }
  }, [userManager]);

  const onClickLogout = useCallback(async () => {
    try {
      await userManager?.signoutRedirect();
      await window.service.window.clearStorageData();
    } catch (error) {
      console.error(error);
    }
  }, [userManager]);

  return [onClickLogin, onClickLogout];
}
