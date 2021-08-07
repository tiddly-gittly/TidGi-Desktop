import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import { TextField, Button } from '@material-ui/core';

import { SupportedStorageServices } from '@services/types';
import { useUserInfoObservable } from '@services/auth/hooks';
import { useAuth } from './gitTokenHooks';

const AuthingLoginButton = styled(Button)`
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

  const [onClickLogin] = useAuth(storageService);

  const userInfo = useUserInfoObservable();
  if (userInfo === undefined) {
    return <div>{t('Loading')}</div>;
  }
  return (
    <>
      <AuthingLoginButton onClick={onClickLogin}>{t('AddWorkspace.LogoutToGetStorageServiceToken')}</AuthingLoginButton>
      <GitTokenInput
        helperText={t('AddWorkspace.GitTokenDescription')}
        onChange={(event) => {
          void window.service.auth.set(`${storageService}-token`, event.target.value);
        }}
        value={userInfo[`${storageService}-token`] ?? ''}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitUserNameDescription')}
        onChange={(event) => {
          void window.service.auth.set(`${storageService}-userName`, event.target.value);
        }}
        value={userInfo[`${storageService}-userName`] ?? ''}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitEmailDescription')}
        onChange={(event) => {
          void window.service.auth.set(`${storageService}-email`, event.target.value);
        }}
        value={userInfo[`${storageService}-email`] ?? ''}
      />
      {children}
    </>
  );
}
