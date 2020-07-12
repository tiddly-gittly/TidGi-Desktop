// @flow
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { GraphQLClient, ClientContext } from 'graphql-hooks';

import Typography from '@material-ui/core/Typography';
import Paper from '@material-ui/core/Paper';

import { GITHUB_GRAPHQL_API } from '../../constants/auth';

import Description from './description-and-mode-switch';
import SearchRepo from './search-repo';
import NewWikiDoneButton from './new-wiki-done-button';
import NewWikiPathForm from './new-wiki-path-form';
import ExistedWikiPathForm from './existed-wiki-path-form';
import ExistedWikiDoneButton from './existed-wiki-done-button';
import { getGithubUserInfo, setGithubUserInfo } from './user-info';
import type { IUserInfo } from './user-info';
import TabBar from './tab-bar';

import { requestSetPreference, getPreference, getDesktopPath, countWorkspace } from '../../senders';

const graphqlClient = new GraphQLClient({
  url: GITHUB_GRAPHQL_API,
});

const Container = styled.main`
  display: flex;
  flex-direction: column;
  overflow: scroll;
  &::-webkit-scrollbar {
    width: 0;
  }
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
  const [currentTab, currentTabSetter] = useState(0);
  const [isCreateMainWorkspace, isCreateMainWorkspaceSetter] = useState(countWorkspace() === 0);
  const [parentFolderLocation, parentFolderLocationSetter] = useState(getDesktopPath());
  const [existedFolderLocation, existedFolderLocationSetter] = useState(getDesktopPath());
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

  const [userInfo, userInfoSetter] = useState<IUserInfo | null>(getGithubUserInfo());
  useEffect(() => {
    setGithubUserInfo(userInfo);
  }, [userInfo]);

  const [mainWikiToLink, mainWikiToLinkSetter] = useState('');
  const [githubWikiUrl, githubWikiUrlSetter] = useState('');

  const [wikiFolderName, wikiFolderNameSetter] = useState('tiddlywiki');

  return (
    <ClientContext.Provider value={graphqlClient}>
      <TabBar currentTab={currentTab} currentTabSetter={currentTabSetter} />
      {currentTab === 0 ? (
        <Container>
          <Description
            isCreateMainWorkspace={isCreateMainWorkspace}
            isCreateMainWorkspaceSetter={isCreateMainWorkspaceSetter}
          />

          <SyncContainer elevation={2} square>
            <Typography variant="subtitle1" align="center">
              同步到云端
            </Typography>
            {userInfo && (
              <SearchRepo
                githubWikiUrl={githubWikiUrl}
                accessToken={accessToken}
                accessTokenSetter={accessTokenSetter}
                githubWikiUrlSetter={githubWikiUrlSetter}
                userInfoSetter={userInfoSetter}
                userInfo={userInfo}
              />
            )}
          </SyncContainer>

          <NewWikiPathForm
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

          <NewWikiDoneButton
            isCreateMainWorkspace={isCreateMainWorkspace}
            wikiPort={wikiPort}
            mainWikiToLink={mainWikiToLink}
            githubWikiUrl={githubWikiUrl}
            wikiFolderName={wikiFolderName}
            parentFolderLocation={parentFolderLocation}
            userInfo={userInfo}
          />
        </Container>
      ) : (
        <Container>
          <Description
            isCreateMainWorkspace={isCreateMainWorkspace}
            isCreateMainWorkspaceSetter={isCreateMainWorkspaceSetter}
          />
          <ExistedWikiPathForm
            existedFolderLocationSetter={existedFolderLocationSetter}
            existedFolderLocation={existedFolderLocation}
            wikiFolderName={wikiFolderName}
            wikiFolderNameSetter={wikiFolderNameSetter}
            mainWikiToLink={mainWikiToLink}
            mainWikiToLinkSetter={mainWikiToLinkSetter}
            wikiPort={wikiPort}
            wikiPortSetter={wikiPortSetter}
            isCreateMainWorkspace={isCreateMainWorkspace}
          />
          <ExistedWikiDoneButton
            isCreateMainWorkspace={isCreateMainWorkspace}
            wikiPort={wikiPort}
            mainWikiToLink={mainWikiToLink}
            githubWikiUrl={githubWikiUrl}
            existedFolderLocation={existedFolderLocation}
            userInfo={userInfo}
          />
        </Container>
      )}
    </ClientContext.Provider>
  );
}
