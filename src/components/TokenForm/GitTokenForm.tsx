import React, { useMemo, useCallback } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import AuthingSSO from '@authing/sso';

import { TextField, Button } from '@material-ui/core';

import { SupportedStorageServices, IAuthingUserInfo } from '@services/types';
import { useUserInfoObservable } from '@services/auth/hooks';
import { usePromiseValueAndSetter } from '@/helpers/useServiceValue';
import GitHubLogin from './AuthingLoginButton';
import { APP_ID, APP_DOMAIN } from '@/constants/auth';
import { IUserInfos } from '@services/auth/interface';

const AuthingLoginButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;
const GitTokenInput = styled(TextField)``;

export function GitTokenForm(props: {
  children?: JSX.Element | Array<JSX.Element | undefined | string>;
  storageService: SupportedStorageServices;
}): JSX.Element {
  const { children, storageService } = props;
  const { t } = useTranslation();

  /**
   * Update tiddlywiki's editor user name when first time creating new workspace
   */
  const [userName, userNameSetter] = usePromiseValueAndSetter(
    async () => await window.service.auth.get('userName'),
    async (newUserName) => await window.service.auth.set('userName', newUserName),
  );

  const authing = useMemo(
    () =>
      new AuthingSSO({
        appId: APP_ID,
        appDomain: APP_DOMAIN,
        redirectUrl: 'http://localhost:3000',
      }),
    [],
  );

  const onFailure = useCallback(async (error: Error) => {}, []);

  const onClickLogin = useCallback(async () => {
    // clear token first, otherwise github login window won't give us a chance to see the form
    // void this.auth.logout();
    // window.remote.clearStorageData();
    try {
      await authing.login();

      const { session, ...response } = await authing.trackSession();
      const isLogin = session !== null && session !== undefined;
      if (isLogin && 'userInfo' in response && response.userInfo?.thirdPartyIdentity?.accessToken !== undefined) {
        const accessTokenToSet = response?.userInfo?.thirdPartyIdentity?.accessToken;
        const authDataString = response?.userInfo?.oauth;
        if (accessTokenToSet !== undefined) {
          void window.service.auth.set((`${storageService}-token` as unknown) as keyof IUserInfos, accessTokenToSet);
        }
        // all data we need
        if (accessTokenToSet !== undefined && authDataString !== undefined) {
          const authData = JSON.parse(authDataString);
          const nextUserInfo: IAuthingUserInfo = {
            ...response.userInfo,
            ...authData,
            ...response.userInfo?.thirdPartyIdentity,
          };
          delete nextUserInfo.oauth;
          delete nextUserInfo.thirdPartyIdentity;
          void window.service.auth.set((`${storageService}-userName` as unknown) as keyof IUserInfos, nextUserInfo.username);
          if (userName === undefined || userName === '') {
            userNameSetter(nextUserInfo.username);
          }
        }
      }
    } catch (error) {
      void onFailure(error);
    }
  }, [authing, onFailure]);
  const onClickLogout = useCallback(async () => {
    const { code, message } = await authing.logout();
    await window.service.window.clearStorageData();
    if (code === 200) {
      // TODO: clear the input
    } else {
      console.error(message);
    }
  }, [authing, onFailure]);

  const userInfo = useUserInfoObservable();
  if (userInfo === undefined) {
    return <div>Loading...</div>;
  }
  return (
    <>
      <AuthingLoginButton>{t('AddWorkspace.LogoutToGetStorageServiceToken')}</AuthingLoginButton>
      <GitTokenInput
        helperText={t('AddWorkspace.GitTokenDescription')}
        fullWidth
        onChange={(event) => {
          void window.service.auth.set(`${storageService}-token`, event.target.value);
        }}
        value={userInfo[`${storageService}-token`]}
      />
      {children}
    </>
  );
}
