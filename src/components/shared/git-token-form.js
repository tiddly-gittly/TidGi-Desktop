// @flow
import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import TextField from '@material-ui/core/TextField';

import GitHubLogin from './github-login';
import { requestSetPreference, getPreference } from '../../senders';
import type { IUserInfo } from '../../helpers/user-info';

const GitTokenInput = styled(TextField)``;

export const setGithubToken = (token: string | void) => requestSetPreference('github-token', token);
export const getGithubToken = () => getPreference<string | void>('github-token') || undefined;

export default function GitTokenForm(props: {
  accessTokenSetter: (((string | void) => string | void) | string | void) => void,
  userInfoSetter: (((IUserInfo | void) => IUserInfo | void) | IUserInfo | void) => void,
  accessToken?: string,
  children?: any,
}) {
  const { accessToken, children } = props;
  const { t } = useTranslation();
  return (
    <>
      <GitHubLogin
        clientId="7b6e0fc33f4afd71a4bb"
        clientSecret="6015d1ca4ded86b4778ed39109193ff20c630bdd"
        redirectUri="http://localhost"
        scope="repo"
        onSuccess={response => {
          const accessTokenToSet = response?.userInfo?.thirdPartyIdentity?.accessToken;
          const authDataString = response?.userInfo?.oauth;
          if (accessTokenToSet) {
            props.accessTokenSetter(accessTokenToSet);
          }
          // all data we need
          if (accessTokenToSet && authDataString) {
            const authData = JSON.parse(authDataString);
            const nextUserInfo = {
              ...response.userInfo,
              ...authData,
              ...response.userInfo.thirdPartyIdentity,
            };
            delete nextUserInfo.oauth;
            delete nextUserInfo.thirdPartyIdentity;
            props.userInfoSetter(nextUserInfo);
          }
        }}
        // eslint-disable-next-line unicorn/no-null
        onLogout={response => props.accessTokenSetter()}
        onFailure={response => {
          props.accessTokenSetter();
          props.userInfoSetter();
        }}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitTokenDescription')}
        fullWidth
        onChange={event => {
          props.accessTokenSetter(event.target.value);
        }}
        label={t('AddWorkspace.GitToken')}
        value={accessToken}
      />
      {children}
    </>
  );
}
