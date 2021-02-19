import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import TextField from '@material-ui/core/TextField';

import GitHubLogin from './github-login';
import type { IAuthingUserInfo } from '@services/types';

const GitTokenInput = styled(TextField)``;

export const setGithubToken = async (token: string | undefined): Promise<void> => await window.service.auth.set('github-token', token);
export const getGithubToken = async (): Promise<string | undefined> => await window.service.auth.get('github-token');

export function GithubTokenForm(props: {
  accessTokenSetter: (token?: string) => void;
  userNameSetter: (userName?: string) => void;
  accessToken?: string;
  children: JSX.Element | Array<JSX.Element | undefined | string>;
}): JSX.Element {
  const { accessToken, children } = props;
  const { t } = useTranslation();
  return (
    <>
      <GitHubLogin
        onSuccess={(response) => {
          const accessTokenToSet = response?.userInfo?.thirdPartyIdentity?.accessToken;
          const authDataString = response?.userInfo?.oauth;
          if (accessTokenToSet !== undefined) {
            props.accessTokenSetter(accessTokenToSet);
          }
          // all data we need
          if (accessTokenToSet !== undefined && authDataString !== undefined) {
            const authData = JSON.parse(authDataString);
            const nextUserInfo = {
              ...response.userInfo,
              ...authData,
              ...response.userInfo.thirdPartyIdentity,
            };
            delete nextUserInfo.oauth;
            delete nextUserInfo.thirdPartyIdentity;
            props.userNameSetter((nextUserInfo as IAuthingUserInfo).username);
          }
        }}
        onLogout={() => props.accessTokenSetter()}
        onFailure={() => {
          props.accessTokenSetter();
          props.userNameSetter();
        }}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitTokenDescription')}
        fullWidth
        onChange={(event) => {
          props.accessTokenSetter(event.target.value);
        }}
        value={accessToken ?? ''}
      />
      {children}
    </>
  );
}
