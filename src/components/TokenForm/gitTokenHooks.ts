/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable @typescript-eslint/await-thenable */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { SupportedStorageServices } from '@services/types';
import { truncate } from 'lodash';
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

const log = (message: string, meta?: Record<string, unknown>): void => {
  void window.service.native.log('debug', message, { function: 'useGetGithubUserInfoOnLoad', ...meta });
};
export function useGetGithubUserInfoOnLoad(): void {
  useEffect(() => {
    void Promise.all([window.service.auth.get('userName'), window.service.auth.getUserInfos()]).then(async ([userName, userInfo]) => {
      try {
        const token = userInfo[`${SupportedStorageServices.github}-token`];
        if (token) {
          log(`get user name and email using github api using token: ${truncate(token ?? '', { length: 6 })}...`);
          // get user name and email using github api
          const response = await fetch('https://api.github.com/user', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const githubUserInfo = await (response.json() as Promise<{ email: string; login: string; name: string }>);
          log(`Get githubUserInfo`, { githubUserInfo });
          // this hook will execute on every open of GitTokenForm, so we need to check if we already have the info, not overwrite userInfo that user manually written.
          if (!userInfo[`${SupportedStorageServices.github}-userName`] && githubUserInfo.login) {
            userInfo[`${SupportedStorageServices.github}-userName`] = githubUserInfo.login;
          }
          if (!userInfo[`${SupportedStorageServices.github}-email`] && githubUserInfo.email) {
            userInfo[`${SupportedStorageServices.github}-email`] = githubUserInfo.email;
          }
          // sometimes user already pick a Chinese username that is different from the one on Github
          if (!userName && githubUserInfo.name) {
            userInfo.userName = githubUserInfo.name;
          }
          log(`Store userInfo`);
          await window.service.auth.setUserInfos(userInfo);
        }
      } catch (error) {
        console.error(error);
      }
    });
  }, []);
}
