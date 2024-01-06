import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { Button, TextField } from '@mui/material';

import { useUserInfoObservable } from '@services/auth/hooks';
import { SupportedStorageServices } from '@services/types';
import { useEffect, useState } from 'react';
import { useAuth, useGetGithubUserInfoOnLoad } from './gitTokenHooks';

const AuthingLoginButton = styled(Button)`
  width: 100%;
`;
const GitTokenInput = styled(TextField)`
  color: ${({ theme }) => theme.palette.text.primary};
  input {
    color: ${({ theme }) => theme.palette.text.primary};
  }
  p,
  label {
    color: ${({ theme }) => theme.palette.text.secondary};
  }
`;
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

  const userInfo = useUserInfoObservable();
  const [onClickLogin] = useAuth(storageService);
  useGetGithubUserInfoOnLoad();
  // local state for text inputs
  const [token, tokenSetter] = useState<string | undefined>(undefined);
  const [userName, userNameSetter] = useState<string | undefined>(undefined);
  const [email, emailSetter] = useState<string | undefined>(undefined);
  const [branch, branchSetter] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (userInfo === undefined) return;
    if (token === undefined) tokenSetter(userInfo[`${storageService}-token`]);
    if (userName === undefined) userNameSetter(userInfo[`${storageService}-userName`]);
    if (email === undefined) emailSetter(userInfo[`${storageService}-email`]);
    if (branch === undefined) branchSetter(userInfo[`${storageService}-branch`]);
  }, [branch, email, storageService, token, userInfo, userName]);
  if (userInfo === undefined) {
    return <div>{t('Loading')}</div>;
  }
  return (
    <>
      <AuthingLoginButton onClick={onClickLogin}>{t('AddWorkspace.LogoutToGetStorageServiceToken')}</AuthingLoginButton>
      <GitTokenInput
        helperText={t('AddWorkspace.GitTokenDescription')}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          void window.service.auth.set(`${storageService}-token`, event.target.value);
          tokenSetter(event.target.value);
        }}
        value={token}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitUserNameDescription')}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          void window.service.auth.set(`${storageService}-userName`, event.target.value);
          userNameSetter(event.target.value);
        }}
        value={userName}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitEmailDescription')}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          void window.service.auth.set(`${storageService}-email`, event.target.value);
          emailSetter(event.target.value);
        }}
        value={email}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitDefaultBranchDescription')}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          void window.service.auth.set(`${storageService}-branch`, event.target.value);
          branchSetter(event.target.value);
        }}
        value={branch}
      />
      {children}
    </>
  );
}
