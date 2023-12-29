/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { SupportedStorageServices } from '@services/types';
import { useCallback, useEffect } from 'react';

export function useAuth(storageService: SupportedStorageServices): [() => Promise<void>, () => Promise<void>] {
  const onClickLogout = useCallback(async () => {
    try {
      await window.service.auth.set(`${storageService}-token`, '');
      await window.service.window.clearStorageData();
    } catch (error) {
      console.error(error);
    }
  }, [storageService]);

  const onClickLogin = useCallback(async () => {
    await onClickLogout();
    try {
      // redirect current page to oauth login page
      switch (storageService) {
        case SupportedStorageServices.github: {
          location.href = await window.service.context.get('GITHUB_OAUTH_PATH');
        }
      }
    } catch (error) {
      console.error(error);
    }
  }, [onClickLogout, storageService]);

  return [onClickLogin, onClickLogout];
}

export function useGetGithubUserInfoOnLoad(): void {
  useEffect(() => {
    void window.service.auth.get(`${SupportedStorageServices.github}-token`).then(async (githubToken) => {
      try {
        // DEBUG: console githubToken
        console.log(`githubToken`, githubToken);
        if (githubToken) {
          // get user name and email using github api
          const response = await fetch('https://api.github.com/user', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${githubToken}`,
            },
          });
          const userInfo = await (response.json() as Promise<{ email: string; login: string; name: string }>);
          // DEBUG: console userInfo
          console.log(`userInfo`, userInfo);
          await window.service.auth.set(`${SupportedStorageServices.github}-userName`, userInfo.login);
          await window.service.auth.set('userName', userInfo.name);
          await window.service.auth.set(`${SupportedStorageServices.github}-email`, userInfo.email);
        }
      } catch (error) {
        console.error(error);
      }
    });
  }, []);
}
