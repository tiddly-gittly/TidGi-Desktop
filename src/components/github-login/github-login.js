/* eslint-disable promise/no-nesting */
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import Button from '@material-ui/core/Button';
import GithubIcon from '@material-ui/icons/GitHub';

import PopupWindow from './popup-window';
import { toQuery } from './utils';

const { remote } = window.require('electron');

const GITHUB_AUTH_UTL = 'https://github.com';

const SyncToGithubButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

class GitHubLogin extends Component {
  static propTypes = {
    clientId: PropTypes.string.isRequired,
    clientSecret: PropTypes.string.isRequired,
    onRequest: PropTypes.func,
    onSuccess: PropTypes.func,
    onFailure: PropTypes.func,
    redirectUri: PropTypes.string,
    scope: PropTypes.string,
  };

  static defaultProps = {
    redirectUri: '',
    scope: 'repo',
    onRequest: () => {},
    onSuccess: () => {},
    onFailure: () => {},
  };

  static logout(url = GITHUB_AUTH_UTL) {
    remote.session.defaultSession.cookies
      .get({ url })
      .then(cookies => {
        console.log(cookies);
        return cookies.forEach(cookie => remote.session.defaultSession.cookies.remove(url, cookie.name));
      })
      .catch(error => {
        console.log(error);
      });
  }

  static async isLogin(url = GITHUB_AUTH_UTL) {
    const cookies = await remote.session.defaultSession.cookies.get({ url });
    return cookies.length > 0;
  }

  constructor(props) {
    super(props);
    this.state = {
      isLogin: false,
    };
    GitHubLogin.isLogin()
      .then(isLogin => this.setState({ isLogin }))
      .catch(console.error);
  }

  onButtonClick = () => {
    const { clientId, clientSecret, scope, redirectUri, onRequest, onSuccess, onFailure } = this.props;
    const search = toQuery({
      client_id: clientId,
      scope,
      redirect_uri: redirectUri,
    });
    const popup = PopupWindow.open('github-oauth-authorize', `${GITHUB_AUTH_UTL}/login/oauth/authorize?${search}`, {
      height: 1000,
      width: 600,
    });
    this.popup = popup;

    onRequest();
    popup
      .then(async data => {
        const { code } = data;
        const tokenResult = await fetch(`${GITHUB_AUTH_UTL}/login/oauth/access_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
        }).then(response => response.text());
        this.setState({ isLogin: true });
        return onSuccess(tokenResult);
      })
      .catch(error => {
        onFailure(error);
        this.setState({ isLogin: false });
      });
  };

  render() {
    const { isLogin } = this.state;
    return isLogin ? (
      <SyncToGithubButton
        onClick={() => {
          GitHubLogin.logout(GITHUB_AUTH_UTL);
          this.setState({ isLogin: false });
        }}
        color="secondary"
        endIcon={<GithubIcon />}
      >
        登出Github账号
      </SyncToGithubButton>
    ) : (
      <SyncToGithubButton onClick={this.onButtonClick} color="secondary" endIcon={<GithubIcon />}>
        登录Github账号
      </SyncToGithubButton>
    );
  }
}

export default GitHubLogin;
