import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import TextField from '@material-ui/core/TextField';

import GitHubLogin from './github-login';
import type { IAuthingUserInfo, IAuthingResponse } from '@services/types';

const GitTokenInput = styled(TextField)``;

export const setGithubToken = async (token: string | undefined): Promise<void> => await window.service.auth.set('github-token', token);
export const getGithubToken = async (): Promise<string | undefined> => await window.service.auth.get('github-token');

export function GithubTokenForm(props: {
  accessTokenSetter: (token?: string) => void;
  userInfoSetter: (info?: IAuthingUserInfo) => void;
  accessToken: string;
  children: JSX.Element;
}): JSX.Element {
  const { accessToken, children } = props;
  const { t } = useTranslation();
  return (
    <>
      <GitHubLogin
        onSuccess={(response: IAuthingResponse) => {
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
            props.userInfoSetter(nextUserInfo as IAuthingUserInfo);
          }
        }}
        // eslint-disable-next-line unicorn/no-null
        onLogout={(response: any) => props.accessTokenSetter()}
        onFailure={(response: any) => {
          props.accessTokenSetter();
          props.userInfoSetter();
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
