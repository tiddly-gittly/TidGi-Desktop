import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import TextField from '@material-ui/core/TextField';

import GitHubLogin from './github-login';
import type { IAuthingUserInfo } from '@services/types';
import { useUserInfoObservable } from '@services/auth/hooks';

const GitTokenInput = styled(TextField)``;

export const setGithubToken = async (token: string | undefined): Promise<void> => await window.service.auth.set('github-token', token);
export const getGithubToken = async (): Promise<string | undefined> => await window.service.auth.get('github-token');

export function GithubTokenForm(props: { children?: JSX.Element | Array<JSX.Element | undefined | string> }): JSX.Element {
  const { children } = props;
  const { t } = useTranslation();
  const userInfo = useUserInfoObservable();
  if (userInfo === undefined) {
    return <div>Loading...</div>;
  }
  return (
    <>
      <GitHubLogin
        onSuccess={(response) => {
          const accessTokenToSet = response?.userInfo?.thirdPartyIdentity?.accessToken;
          const authDataString = response?.userInfo?.oauth;
          if (accessTokenToSet !== undefined) {
            void window.service.auth.set('github-token', accessTokenToSet);
          }
          // all data we need
          if (accessTokenToSet !== undefined && authDataString !== undefined) {
            const authData = JSON.parse(authDataString);
            const nextUserInfo = {
              ...response.userInfo,
              ...authData,
              ...response.userInfo?.thirdPartyIdentity,
            };
            delete nextUserInfo.oauth;
            delete nextUserInfo.thirdPartyIdentity;
            void window.service.auth.set('github-userName', (nextUserInfo as IAuthingUserInfo).username);
          }
        }}
        onLogout={() => {
          void window.service.auth.set('github-token', '');
          void window.service.auth.set('github-userName', '');
        }}
        onFailure={() => {
          void window.service.auth.set('github-token', '');
          void window.service.auth.set('github-userName', '');
        }}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitTokenDescription')}
        fullWidth
        onChange={(event) => {
          void window.service.auth.set('github-token', event.target.value);
        }}
        value={userInfo['github-token']}
      />
      {children}
    </>
  );
}
