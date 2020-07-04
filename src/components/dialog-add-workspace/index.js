// @flow
import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { GraphQLClient, ClientContext } from 'graphql-hooks';

import Typography from '@material-ui/core/Typography';
import Paper from '@material-ui/core/Paper';

import { GITHUB_GRAPHQL_API } from '../../constants/auth';

import Description from './description-and-mode-switch';
import GitHubLogin from './github-login';
import SearchRepo from './search-repo';
import DoneButton from './done-button';
import WikiPathForm from './wiki-path-form';

import { requestSetPreference, getPreference, getDesktopPath, countWorkspace } from '../../senders';

const graphqlClient = new GraphQLClient({
  url: GITHUB_GRAPHQL_API,
});

const Container = styled.main`
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: scroll;
  &::-webkit-scrollbar {
    width: 0;
  }
  padding-bottom: 35px;
`;
const SyncContainer = styled(Paper)`
  margin-top: 5px;
`;

const setGithubToken = (token: string) => requestSetPreference('github-token', token);
const getGithubToken = () => getPreference<string | null>('github-token');
const setGithubUsername = (username: string) => requestSetPreference('github-username', username);
const getGithubUsername = () => getPreference<string | null>('github-username');

export default function AddWorkspace() {
  const [isCreateMainWorkspace, isCreateMainWorkspaceSetter] = useState(countWorkspace() === 0);
  const [parentFolderLocation, parentFolderLocationSetter] = useState(getDesktopPath());
  const [wikiPort, wikiPortSetter] = useState(5212 + countWorkspace());

  // try get token from local storage, and set to state for gql to use
  const setGraphqlClientHeader = useCallback((accessToken: string) => {
    graphqlClient.setHeader('Authorization', `bearer ${accessToken}`);
    setGithubToken(accessToken);
  }, []);
  useEffect(() => {
    const accessToken = getGithubToken();
    if (accessToken) {
      setGraphqlClientHeader(accessToken);
    }
  }, [setGraphqlClientHeader]);

  const [mainWikiToLink, mainWikiToLinkSetter] = useState('');

  const [wikiFolderName, wikiFolderNameSetter] = useState('tiddlywiki');

  const githubUsername = getGithubUsername();
  return (
    <ClientContext.Provider value={graphqlClient}>
      <Container>
        <Description
          isCreateMainWorkspace={isCreateMainWorkspace}
          isCreateMainWorkspaceSetter={isCreateMainWorkspaceSetter}
        />

        <SyncContainer elevation={2} square>
          <Typography variant="subtitle1" align="center">
            同步到云端
          </Typography>
          <GitHubLogin
            clientId="7b6e0fc33f4afd71a4bb"
            clientSecret="6015d1ca4ded86b4778ed39109193ff20c630bdd"
            redirectUri="http://localhost"
            scope="repo"
            onSuccess={response => {
              const accessToken = response?.userInfo?.thirdPartyIdentity?.accessToken;
              const authData = response?.userInfo?.oauth;
              if (accessToken) {
                setGraphqlClientHeader(accessToken);
              }
              if (authData) {
                setGithubUsername(JSON.parse(authData).login);
              }
            }}
            onFailure={response => console.log(response)}
          />
          {Object.keys(graphqlClient.headers).length > 0 && githubUsername && (
            <SearchRepo githubUsername={githubUsername} />
          )}
        </SyncContainer>

        <WikiPathForm
          parentFolderLocation={parentFolderLocation}
          parentFolderLocationSetter={parentFolderLocationSetter}
          wikiFolderName={wikiFolderName}
          wikiFolderNameSetter={wikiFolderNameSetter}
          mainWikiToLink={mainWikiToLink}
          mainWikiToLinkSetter={mainWikiToLinkSetter}
          wikiPort={wikiPort}
          wikiPortSetter={wikiPortSetter}
          isCreateMainWorkspace={isCreateMainWorkspace}
        />

        <DoneButton
          isCreateMainWorkspace={isCreateMainWorkspace}
          wikiPort={wikiPort}
          mainWikiToLink={mainWikiToLink}
          wikiFolderName={wikiFolderName}
          parentFolderLocation={parentFolderLocation}
        />
      </Container>
    </ClientContext.Provider>
  );
}
