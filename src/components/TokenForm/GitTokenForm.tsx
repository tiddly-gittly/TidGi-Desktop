import { Button, TextField } from '@mui/material';
import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { useUserInfoObservable } from '@services/auth/hooks';
import { IUserInfos } from '@services/auth/interface';
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

  const debouncedSet = useDebouncedCallback(
    <K extends keyof IUserInfos>(key: K, value: IUserInfos[K]) => {
      void window.service.auth.set(key, value);
    },
    [],
    500,
  );
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
          tokenSetter(event.target.value);
          debouncedSet(`${storageService}-token`, event.target.value);
        }}
        value={token}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitUserNameDescription')}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          userNameSetter(event.target.value);
          debouncedSet(`${storageService}-userName`, event.target.value);
        }}
        value={userName}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitEmailDescription')}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          emailSetter(event.target.value);
          debouncedSet(`${storageService}-email`, event.target.value);
        }}
        value={email}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitDefaultBranchDescription')}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          branchSetter(event.target.value);
          debouncedSet(`${storageService}-branch`, event.target.value);
        }}
        value={branch}
      />
      {children}
    </>
  );
}
