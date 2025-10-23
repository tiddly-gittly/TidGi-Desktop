import { Button, TextField } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';

import { SupportedStorageServices } from '@services/types';
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

export function GitTokenForm(props: {
  children?: React.JSX.Element | Array<React.JSX.Element | undefined | string>;
  storageService: SupportedStorageServices;
}): React.JSX.Element {
  const { children, storageService } = props;
  const { t } = useTranslation();

  const [onClickLogin, onClickLogout] = useAuth(storageService);
  useGetGithubUserInfoOnLoad();

  const { token, userName, email, branch, isLoggedIn, isReady, tokenSetter, userNameSetter, emailSetter, branchSetter } = useTokenForm(storageService);

  if (!isReady) {
    return <div>{t('Loading')}</div>;
  }
  return (
    <>
      {!isLoggedIn && (
        <AuthingLoginButton onClick={onClickLogin} data-testid={`${storageService}-login-button`}>{t('AddWorkspace.LogoutToGetStorageServiceToken')}</AuthingLoginButton>
      )}
      {isLoggedIn && <AuthingLoginButton onClick={onClickLogout} color='secondary' data-testid={`${storageService}-logout-button`}>{t('Preference.Logout')}</AuthingLoginButton>}
      <GitTokenInput
        helperText={t('AddWorkspace.GitTokenDescription')}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          tokenSetter(event.target.value);
        }}
        value={token}
        data-testid={`${storageService}-token-input`}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitUserNameDescription')}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          userNameSetter(event.target.value);
        }}
        value={userName}
        data-testid={`${storageService}-userName-input`}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitEmailDescription')}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          emailSetter(event.target.value);
        }}
        value={email}
        data-testid={`${storageService}-email-input`}
      />
      <GitTokenInput
        helperText={t('AddWorkspace.GitDefaultBranchDescription')}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          branchSetter(event.target.value);
        }}
        value={branch}
        data-testid={`${storageService}-branch-input`}
      />
      {children}
    </>
  );
}
