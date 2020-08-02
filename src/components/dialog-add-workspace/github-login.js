// @flow
/* eslint-disable promise/no-nesting */
import type { ComponentType } from 'react';
import React, { Component } from 'react';
import styled from 'styled-components';
import Button from '@material-ui/core/Button';
import GithubIcon from '@material-ui/icons/GitHub';
import AuthingSSO from '@authing/sso';
import { withTranslation } from 'react-i18next';

import { APP_DOMAIN, APP_ID } from '../../constants/auth';

const SyncToGithubButton: ComponentType<{}> = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

interface Props {
  t: (x: string) => string;
  onRequest: Function;
  onSuccess: Function;
  onLogout: Function;
  onFailure: Function;
}
interface State {
  isLogin: boolean;
}
class GitHubLogin extends Component<Props, State> {
  static defaultProps = {
    onRequest: () => {},
    onSuccess: () => {},
    onLogout: () => {},
    onFailure: () => {},
  };

  auth: AuthingSSO;
  intervalHandel: ?IntervalID;

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

  async isLogin() {
    const { onSuccess } = this.props;
    const { session, ...rest } = await this.auth.trackSession();
    const isLogin = session !== null;
    if (isLogin) {
      onSuccess(rest);
    }
    return isLogin;
  }

  updateLoginState() {
    this.intervalHandel = setInterval(() => {
      // eslint-disable-next-line promise/catch-or-return, promise/always-return
      this.isLogin().then(isLogin => {
        this.setState({ isLogin });
        clearInterval(this.intervalHandel);
      });
    }, 500);
  }

  render() {
    const { onRequest, onLogout, onFailure, t } = this.props;
    const { isLogin } = this.state;
    return isLogin ? (
      <SyncToGithubButton
        onClick={async () => {
          const { code, message } = await this.auth.logout();
          window.remote.clearStorageData();
          if (code === 200) {
            this.setState({ isLogin: false });
            this.updateLoginState();
            onLogout();
          } else {
            console.error(message);
          }
        }}
        color="secondary"
        endIcon={<GithubIcon />}
      >
        {t('AddWorkspace.LogoutGithubAccount')}
      </SyncToGithubButton>
    ) : (
      <SyncToGithubButton
        onClick={() => {
          try {
            onRequest();
            this.auth.login();
          } catch (error) {
            onFailure(error);
          }
        }}
        color="secondary"
        endIcon={<GithubIcon />}
      >
        {t('AddWorkspace.LoginGithubAccount')}
      </SyncToGithubButton>
    );
  }
}

export default withTranslation()(GitHubLogin);
