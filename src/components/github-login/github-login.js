/* eslint-disable promise/no-nesting */
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import Button from '@material-ui/core/Button';
import GithubIcon from '@material-ui/icons/GitHub';
import AuthingSSO from '@authing/sso';

import { APP_DOMAIN, APP_ID } from '../../constants/auth';

const SyncToGithubButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

class GitHubLogin extends Component {
  static propTypes = {
    onRequest: PropTypes.func,
    onSuccess: PropTypes.func,
    onFailure: PropTypes.func,
  };

  static defaultProps = {
    onRequest: () => {},
    onSuccess: () => {},
    onFailure: () => {},
  };

  constructor(props) {
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
    const { onRequest, onFailure } = this.props;
    const { isLogin } = this.state;
    return isLogin ? (
      <SyncToGithubButton
        onClick={async () => {
          const { code, message } = await this.auth.logout();
          if (code === 200) {
            this.setState({ isLogin: false });
            this.updateLoginState();
          } else {
            console.error(message);
          }
        }}
        color="secondary"
        endIcon={<GithubIcon />}
      >
        登出Github账号
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
        登录Github账号
      </SyncToGithubButton>
    );
  }
}

export default GitHubLogin;
