/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable @typescript-eslint/await-thenable */

import { buildOAuthUrl, getOAuthConfig } from '@/constants/oauthConfig';
import { SupportedStorageServices } from '@services/types';
import { useCallback, useEffect } from 'react';

export function useAuth(storageService: SupportedStorageServices): [() => Promise<void>, () => Promise<void>] {
  const onClickLogout = useCallback(async () => {
    try {
      // Clear tokens
      await window.service.auth.set(`${storageService}-token`, '');
      await window.service.auth.set(`${storageService}-userName`, '');
      await window.service.auth.set(`${storageService}-email`, '');

      // Clear PKCE code_verifier from main process memory
      await window.service.auth.storeOAuthVerifier(storageService, '');

      // Clear browser cookies for specific OAuth provider domain
      // This clears the "remember me" state for only this service
      const config = getOAuthConfig(storageService);
      if (config?.authorizePath) {
        try {
          const oauthUrl = new URL(config.authorizePath);
          const domain = oauthUrl.hostname;

          // Clear cookies for this specific domain only
          await window.service.auth.clearCookiesForDomain(domain);
        } catch (error) {
          void window.service.native.log('error', 'Failed to parse OAuth URL or clear cookies', { function: 'useAuth', error });
        }
      }

      void window.service.native.log('info', 'Logged out from service', { function: 'useAuth', storageService });
    } catch (error) {
      void window.service.native.log('error', 'TokenForm: auth operation failed', { function: 'useAuth', error });
    }
  }, [storageService]);

  const onClickLogin = useCallback(async () => {
    await onClickLogout();
    try {
      const oauthResult = await buildOAuthUrl(storageService);
      if (oauthResult) {
        // Store code_verifier in main process for PKCE flow
        if (oauthResult.codeVerifier) {
          await window.service.auth.storeOAuthVerifier(storageService, oauthResult.codeVerifier);
        }
        location.href = oauthResult.url;
      } else {
        void window.service.native.log('error', 'OAuth not configured for this service', { function: 'useAuth', storageService });
      }
    } catch (error) {
      console.error(error);
    }
  }, [onClickLogout, storageService]);

  return [onClickLogin, onClickLogout];
}

export function useGetGithubUserInfoOnLoad(): void {
  useEffect(() => {
    void window.service.native.log('debug', 'useGetGithubUserInfoOnLoad: hook mounted', { function: 'useGetGithubUserInfoOnLoad' });
    void Promise.all([window.service.auth.get('userName'), window.service.auth.getUserInfos()]).then(async ([userName, userInfo]) => {
      try {
        const token = userInfo[`${SupportedStorageServices.github}-token`];
        void window.service.native.log('debug', 'useGetGithubUserInfoOnLoad: checking token', {
          function: 'useGetGithubUserInfoOnLoad',
          hasToken: !!token,
          tokenLength: token?.length ?? 0,
        });

        if (token) {
          const config = getOAuthConfig(SupportedStorageServices.github);
          if (!config) return;

          // get user name and email using OAuth provider's API
          const response = await fetch(config.userInfoPath, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const gitUserInfo = await (response.json() as Promise<{ email: string; login: string; name: string }>);

          // this hook will execute on every open of GitTokenForm, so we need to check if we already have the info, not overwrite userInfo that user manually written.
          if (!userInfo[`${SupportedStorageServices.github}-userName`] && gitUserInfo.login) {
            userInfo[`${SupportedStorageServices.github}-userName`] = gitUserInfo.login;
          }
          if (!userInfo[`${SupportedStorageServices.github}-email`] && gitUserInfo.email) {
            userInfo[`${SupportedStorageServices.github}-email`] = gitUserInfo.email;
          }
          // sometimes user already pick a Chinese username that is different from the one on Git service
          if (!userName && gitUserInfo.name) {
            userInfo.userName = gitUserInfo.name;
          }

          await window.service.auth.setUserInfos(userInfo);
        }
      } catch (error) {
        void window.service.native.log('error', 'TokenForm: get github user info failed', { function: 'useGetGithubUserInfoOnLoad', error });
      }
    });
  }, []);
}
