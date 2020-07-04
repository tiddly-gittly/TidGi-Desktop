// @flow
import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { GraphQLClient, ClientContext } from 'graphql-hooks';

import Typography from '@material-ui/core/Typography';
import Paper from '@material-ui/core/Paper';

import { GITHUB_GRAPHQL_API } from '../../constants/auth';

import Description from './description-and-mode-switch';
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

const setGithubToken = (token: string | null) => requestSetPreference('github-token', token);
const getGithubToken = () => getPreference<string | null>('github-token');
const setHeaderToGraphqlClient = (token: string) => graphqlClient.setHeader('Authorization', `bearer ${token}`);
const previousToken = getGithubToken();
previousToken && setHeaderToGraphqlClient(previousToken);

export default function AddWorkspace() {
  const [isCreateMainWorkspace, isCreateMainWorkspaceSetter] = useState(countWorkspace() === 0);
  const [parentFolderLocation, parentFolderLocationSetter] = useState(getDesktopPath());
  const [wikiPort, wikiPortSetter] = useState(5212 + countWorkspace());

  // try get token on start up
  const [accessToken, accessTokenSetter] = useState<string | null>(previousToken);
  // try get token from local storage, and set to state for gql to use
  useEffect(() => {
    if (accessToken) {
      graphqlClient.setHeader('Authorization', `bearer ${accessToken}`);
      setGithubToken(accessToken);
    } else {
      Object.keys(graphqlClient.headers).map(key => graphqlClient.removeHeader(key));
      setGithubToken(accessToken);
    }
  }, [accessToken]);

  const [mainWikiToLink, mainWikiToLinkSetter] = useState('');
  const [githubWikiUrl, githubWikiUrlSetter] = useState('');

  const [wikiFolderName, wikiFolderNameSetter] = useState('tiddlywiki');

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
          <SearchRepo
            accessToken={accessToken}
            accessTokenSetter={accessTokenSetter}
            githubWikiUrlSetter={githubWikiUrlSetter}
          />
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
          githubWikiUrl={githubWikiUrl}
          wikiFolderName={wikiFolderName}
          parentFolderLocation={parentFolderLocation}
        />
      </Container>
    </ClientContext.Provider>
  );
}
