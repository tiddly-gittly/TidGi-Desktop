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
    void Promise.all([window.service.auth.get('userName'), window.service.auth.getUserInfos()]).then(async ([userName, userInfo]) => {
      try {
        const token = userInfo[`${SupportedStorageServices.github}-token`];
        if (token) {
          // get user name and email using github api
          const response = await fetch('https://api.github.com/user', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const githubUserInfo = await (response.json() as Promise<{ email: string; login: string; name: string }>);
          userInfo[`${SupportedStorageServices.github}-userName`] = githubUserInfo.login;
          userInfo[`${SupportedStorageServices.github}-email`] = githubUserInfo.email;
          // sometimes user already pick a Chinese username that is different from the one on Github
          if (userName === undefined) {
            userInfo.userName = githubUserInfo.name;
          }
          window.service.auth.setUserInfos(userInfo);
        }
      } catch (error) {
        console.error(error);
      }
    });
  }, []);
}
