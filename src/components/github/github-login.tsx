/* eslint-disable promise/no-nesting */
import React, { Component } from 'react';
import styled from 'styled-components';
import Button from '@material-ui/core/Button';
import GithubIcon from '@material-ui/icons/GitHub';
import AuthingSSO, { ILoginInfo } from '@authing/sso';
import { withTranslation } from 'react-i18next';

import { APP_DOMAIN, APP_ID } from '../../constants/auth';

const SyncToGithubButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

interface Props {
  t: (x: string) => string;
  onRequest: () => unknown;
  onSuccess: (info: Partial<ILoginInfo>) => unknown;
  onLogout: () => unknown;
  onFailure: (error: Error) => unknown;
}
interface State {
  isLogin: boolean;
}
class GitHubLogin extends Component<Props, State> {
  static defaultProps: Partial<Props> = {
    onRequest: () => {},
    onSuccess: () => {},
    onLogout: () => {},
    onFailure: () => {},
  };

  auth: AuthingSSO;
  intervalHandel?: NodeJS.Timeout;

  constructor(props: Props) {
    super(props);
    this.state = {
      isLogin: false,
    };
    this.auth = new AuthingSSO({
      appId: APP_ID,
      appDomain: APP_DOMAIN,
      redirectUrl: 'http://localhost:3000',
    });
    this.updateLoginState();
  }

  async isLogin(): Promise<boolean> {
    const { onSuccess, onLogout } = this.props;
    const { session, ...rest } = await this.auth.trackSession();
    const isLogin = session !== null && session !== undefined;
    if (isLogin) {
      onSuccess(rest);
    } else {
      onLogout();
    }
    return isLogin;
  }

  updateLoginState(): void {
    this.intervalHandel = setInterval(() => {
      void this.isLogin().then((isLogin) => {
        this.setState({ isLogin });
        if (this.intervalHandel !== undefined) {
          clearInterval(this.intervalHandel);
        }
      });
    }, 500);
  }

  render(): JSX.Element {
    const { onRequest, onLogout, onFailure, t } = this.props;
    const { isLogin } = this.state;
    return isLogin ? (
      <SyncToGithubButton
        onClick={async () => {
          const { code, message } = await this.auth.logout();
          await window.service.window.clearStorageData();
          if (code === 200) {
            this.setState({ isLogin: false });
            this.updateLoginState();
            onLogout();
          } else {
            console.error(message);
          }
        }}
        color="secondary"
        endIcon={<GithubIcon />}>
        {t('AddWorkspace.LogoutGithubAccount')}
      </SyncToGithubButton>
    ) : (
      <SyncToGithubButton
        onClick={async () => {
          // clear token first, otherwise github login window won't give us a chance to see the form
          // void this.auth.logout();
          // window.remote.clearStorageData();
          try {
            onRequest();
            await this.auth.login();
          } catch (error) {
            onFailure(error);
          }
        }}
        color="secondary"
        endIcon={<GithubIcon />}>
        {t('AddWorkspace.LoginGithubAccount')}
      </SyncToGithubButton>
    );
  }
}

export default withTranslation()(GitHubLogin);
