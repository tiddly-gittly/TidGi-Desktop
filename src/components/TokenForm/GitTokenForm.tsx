import React, { useMemo, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import AuthingSSO, { ITrackSessionResult } from '@authing/sso';

import { TextField, Button } from '@material-ui/core';

import { SupportedStorageServices, IAuthingUserInfo } from '@services/types';
import { useUserInfoObservable } from '@services/auth/hooks';
import { usePromiseValueAndSetter } from '@/helpers/useServiceValue';
import { APP_ID, APP_DOMAIN } from '@/constants/auth';
import { ServiceEmailTypes, ServiceTokenTypes, ServiceUserNameTypes } from '@services/auth/interface';

const AuthingLoginButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;
const GitTokenInput = styled(TextField)``;
GitTokenInput.defaultProps = {
  fullWidth: true,
  variant: 'standard',
};

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

  const onFailure = useCallback((error: Error) => {
    console.error(error);
  }, []);

  const onLoginSuccessResponse = useCallback(
    async (response: ITrackSessionResult) => {
      // DEBUG: console
      console.log(`response`, response);
      if ('userInfo' in response && response.userInfo?.thirdPartyIdentity?.accessToken !== undefined) {
        const accessTokenToSet = response?.userInfo?.thirdPartyIdentity?.accessToken;
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
          void window.service.auth.set(`${storageService}-token` as ServiceTokenTypes, accessTokenToSet);
          void window.service.auth.set(`${storageService}-userName` as ServiceUserNameTypes, nextUserInfo.username);
          void window.service.auth.set(`${storageService}-email` as ServiceEmailTypes, nextUserInfo.email);
          if (userName === undefined || (userName === '' && nextUserInfo.username !== userName)) {
            userNameSetter(nextUserInfo.username);
          }
        }
      }
    },
    [storageService, userName, userNameSetter],
  );

  const onClickLogout = useCallback(async () => {
    const { code, message } = await authing.logout();
    await window.service.window.clearStorageData();
    if (code === 200) {
      // TODO: clear the input
    } else {
      onFailure(new Error(message));
    }
  }, [authing, onFailure]);

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

  const onClickLogin = useCallback(async () => {
    // clear token first, otherwise github login window won't give us a chance to see the form
    // void this.auth.logout();
    // window.remote.clearStorageData();
    try {
      await authing.login();
    } catch (error) {
      onFailure(error);
    }
  }, [authing, onFailure]);

  const userInfo = useUserInfoObservable();
  // DEBUG: console
  console.log(`userInfo`, JSON.stringify(userInfo));
  if (userInfo === undefined) {
    return <div>Loading...</div>;
  }
  return (
    <>
      <AuthingLoginButton onClick={onClickLogin}>{t('AddWorkspace.LogoutToGetStorageServiceToken')}</AuthingLoginButton>
      <GitTokenInput
        helperText={t('AddWorkspace.GitTokenDescription')}
        onChange={(event) => {
          void window.service.auth.set(`${storageService}-token` as ServiceTokenTypes, event.target.value);
        }}
        value={userInfo[`${storageService}-token` as ServiceTokenTypes] ?? ''}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitUserNameDescription')}
        onChange={(event) => {
          void window.service.auth.set(`${storageService}-userName` as ServiceUserNameTypes, event.target.value);
        }}
        value={userInfo[`${storageService}-userName` as ServiceUserNameTypes] ?? ''}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitEmailDescription')}
        onChange={(event) => {
          void window.service.auth.set(`${storageService}-email` as ServiceEmailTypes, event.target.value);
        }}
        value={userInfo[`${storageService}-email` as ServiceEmailTypes] ?? ''}
      />
      {children}
    </>
  );
}
