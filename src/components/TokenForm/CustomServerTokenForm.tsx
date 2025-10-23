import { Button, TextField } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';

import { SupportedStorageServices } from '@services/types';
import { useState } from 'react';
import { useAuth, useGetGithubUserInfoOnLoad } from './gitTokenHooks';
import { useTokenForm } from './useTokenForm';

const AuthingLoginButton = styled(Button)`
  width: 100%;
`;
const GitTokenInput = styled((props: React.ComponentProps<typeof TextField> & { helperText?: string }) => <TextField fullWidth variant='standard' {...props} />)`
  color: ${({ theme }) => theme.palette.text.primary};
  input {
    color: ${({ theme }) => theme.palette.text.primary};
  }
  p,
  label {
    color: ${({ theme }) => theme.palette.text.secondary};
  }
`;

export function CustomServerTokenForm(): React.JSX.Element {
  const { t } = useTranslation();
  const storageService = SupportedStorageServices.testOAuth;

  const [onClickLogin, onClickLogout] = useAuth(storageService);
  useGetGithubUserInfoOnLoad();

  const { token, userName, email, branch, isLoggedIn, isReady, tokenSetter, userNameSetter, emailSetter, branchSetter } = useTokenForm(storageService);

  // Custom server configuration
  const [serverUrl, serverUrlSetter] = useState<string>('http://127.0.0.1:8888');
  const [clientId, clientIdSetter] = useState<string>('test-client-id');

  // Store custom server config before OAuth login
  const handleLogin = async () => {
    // Save custom server configuration
    await window.service.auth.set('testOAuth-serverUrl', serverUrl);
    await window.service.auth.set('testOAuth-clientId', clientId);
    // Then trigger OAuth login
    await onClickLogin();
  };

  if (!isReady) {
    return <div>{t('Loading')}</div>;
  }

  return (
    <>
      <GitTokenInput
        label={t('AddWorkspace.CustomServerUrl')}
        helperText={t('AddWorkspace.CustomServerUrlDescription')}
        value={serverUrl}
        onChange={(event) => {
          serverUrlSetter(event.target.value);
        }}
        placeholder='http://127.0.0.1:8888'
        data-testid='custom-server-url-input'
      />
      <GitTokenInput
        label={t('AddWorkspace.CustomClientId')}
        helperText={t('AddWorkspace.CustomClientIdDescription')}
        value={clientId}
        onChange={(event) => {
          clientIdSetter(event.target.value);
        }}
        placeholder='client-id'
        data-testid='custom-client-id-input'
      />
      {!isLoggedIn && (
        <AuthingLoginButton onClick={handleLogin} data-testid='custom-oauth-login-button'>
          {t('AddWorkspace.LogoutToGetStorageServiceToken')}
        </AuthingLoginButton>
      )}
      {isLoggedIn && (
        <AuthingLoginButton onClick={onClickLogout} color='secondary' data-testid='custom-oauth-logout-button'>
          {t('Preference.Logout')}
        </AuthingLoginButton>
      )}
      <GitTokenInput
        label={t('AddWorkspace.GitToken')}
        helperText={t('AddWorkspace.GitTokenDescription')}
        onChange={(event) => {
          tokenSetter(event.target.value);
        }}
        value={token}
        data-testid='custom-token-input'
      />
      <GitTokenInput
        label={t('AddWorkspace.GitUserName')}
        helperText={t('AddWorkspace.GitUserNameDescription')}
        onChange={(event) => {
          userNameSetter(event.target.value);
        }}
        value={userName}
        data-testid='custom-username-input'
      />
      <GitTokenInput
        label={t('AddWorkspace.GitEmail')}
        helperText={t('AddWorkspace.GitEmailDescription')}
        onChange={(event) => {
          emailSetter(event.target.value);
        }}
        value={email}
        data-testid='custom-email-input'
      />
      <GitTokenInput
        label={t('AddWorkspace.GitBranch')}
        helperText={t('AddWorkspace.GitBranchDescription')}
        onChange={(event) => {
          branchSetter(event.target.value);
        }}
        value={branch}
        placeholder='main'
        data-testid='custom-branch-input'
      />
    </>
  );
}
