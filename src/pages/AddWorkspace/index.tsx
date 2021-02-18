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
import CloneWikiDoneButton from './clone-wiki-done-button';
import type { ISubWikiPluginContent } from '@services/wiki/update-plugin-content';
import type { IAuthingUserInfo } from '@services/types';
import TabBar from './tab-bar';
import { GithubTokenForm, getGithubToken, setGithubToken } from '../../components/github/git-token-form';
import { usePromiseValue, usePromiseValueAndSetter } from '@/helpers/use-service-value';

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
const GithubRepoLink = styled(Typography)`
  cursor: pointer;
  opacity: 50%;
  &:hover {
    opacity: 100%;
  }
`;

export default function AddWorkspace(): JSX.Element {
  const [currentTab, currentTabSetter] = useState('CloneOnlineWiki');
  const [isCreateMainWorkspace, isCreateMainWorkspaceSetter] = useState(false);
  useEffect(() => {
    void window.service.workspace.countWorkspaces().then((workspaceCount) => isCreateMainWorkspaceSetter(workspaceCount === 0));
  }, []);
  const parentFolderLocation = usePromiseValue(async () => (await window.service.context.get('DESKTOP_PATH')) as string);
  const existedFolderLocation = usePromiseValue(async () => (await window.service.context.get('DESKTOP_PATH')) as string);

  const [wikiPort, wikiPortSetter] = useState(5212);
  useEffect(() => {
    // only update default port on component mount
    void window.service.workspace.countWorkspaces().then((workspaceCount) => wikiPortSetter(wikiPort + workspaceCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TODO: refactor GITHUB related things out, make it can switch between vendors
  const cachedGithubToken = usePromiseValue(getGithubToken);
  // try get token on start up, so Github GraphQL client can use it
  const [accessToken, accessTokenSetter] = useState<string | undefined>();
  // try get token from local storage, and set to state for gql to use
  useEffect(() => {
    // on startup, loading the cachedGithubToken
    if (accessToken === undefined && cachedGithubToken !== undefined) {
      graphqlClient.setHeader('Authorization', `bearer ${cachedGithubToken}`);
      accessTokenSetter(cachedGithubToken);
    } else if (accessToken !== undefined && accessToken !== cachedGithubToken) {
      // if user or login button changed the token, we use latest token
      Object.keys(graphqlClient.headers).map((key) => graphqlClient.removeHeader(key));
      accessTokenSetter(accessToken);
      void setGithubToken(accessToken);
    }
  }, [cachedGithubToken, accessToken]);

  const [userName, userNameSetter] = usePromiseValueAndSetter(
    async () => await window.service.auth.get('userName'),
    async (newUserName) => await window.service.auth.set('userName', newUserName),
  );

  const [mainWikiToLink, mainWikiToLinkSetter] = useState({ name: '', port: 0 });
  const [tagName, tagNameSetter] = useState<string>('');
  const [fileSystemPaths, fileSystemPathsSetter] = useState<ISubWikiPluginContent[]>([]);
  useEffect(() => {
    void window.service.wiki.getSubWikiPluginContent(mainWikiToLink.name).then(fileSystemPathsSetter);
  }, [mainWikiToLink]);
  const [githubWikiUrl, githubWikiUrlSetter] = useState<string>('');
  useEffect(() => {
    void (async function getWorkspaceRemoteInEffect(): Promise<void> {
      if (existedFolderLocation !== undefined) {
        const url = await window.service.git.getWorkspacesRemote(existedFolderLocation);
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (url) {
          githubWikiUrlSetter(url);
        }
      }
    })();
  }, [githubWikiUrl, existedFolderLocation]);

  const [wikiFolderName, wikiFolderNameSetter] = useState('tiddlywiki');

  return (
    <ClientContext.Provider value={graphqlClient}>
      <TabBar currentTab={currentTab} currentTabSetter={currentTabSetter} />
      <Description isCreateMainWorkspace={isCreateMainWorkspace} isCreateMainWorkspaceSetter={isCreateMainWorkspaceSetter} />
      <SyncContainer elevation={2} square>
        <GithubTokenForm accessTokenSetter={accessTokenSetter} userInfoSetter={userInfoSetter} accessToken={accessToken}>
          {githubWikiUrl && (
            <GithubRepoLink onClick={async () => await window.service.native.open(githubWikiUrl)} variant="subtitle2" align="center">
              ({githubWikiUrl})
            </GithubRepoLink>
          )}
          <SearchRepo
            githubWikiUrl={githubWikiUrl}
            accessToken={accessToken}
            githubWikiUrlSetter={githubWikiUrlSetter}
            userInfo={userInfo}
            currentTab={currentTab}
            wikiFolderNameSetter={wikiFolderNameSetter}
            isCreateMainWorkspace={isCreateMainWorkspace}
          />
        </GithubTokenForm>
      </SyncContainer>

      {currentTab === 'CreateNewWiki' && (
        <Container>
          <NewWikiPathForm
            parentFolderLocation={parentFolderLocation}
            parentFolderLocationSetter={parentFolderLocationSetter}
            wikiFolderName={wikiFolderName}
            tagName={tagName}
            tagNameSetter={tagNameSetter}
            wikiFolderNameSetter={wikiFolderNameSetter}
            mainWikiToLink={mainWikiToLink}
            mainWikiToLinkSetter={mainWikiToLinkSetter}
            wikiPort={wikiPort}
            wikiPortSetter={wikiPortSetter}
            fileSystemPaths={fileSystemPaths}
            isCreateMainWorkspace={isCreateMainWorkspace}
          />

          <NewWikiDoneButton
            isCreateMainWorkspace={isCreateMainWorkspace}
            wikiPort={wikiPort}
            mainWikiToLink={mainWikiToLink}
            githubWikiUrl={githubWikiUrl}
            wikiFolderName={wikiFolderName}
            tagName={tagName}
            parentFolderLocation={parentFolderLocation}
            userInfo={userInfo}
          />
        </Container>
      )}
      {currentTab === 'OpenLocalWiki' && (
        <Container>
          <ExistedWikiPathForm
            existedFolderLocationSetter={existedFolderLocationSetter}
            existedFolderLocation={existedFolderLocation}
            wikiFolderName={wikiFolderName}
            tagName={tagName}
            tagNameSetter={tagNameSetter}
            wikiFolderNameSetter={wikiFolderNameSetter}
            mainWikiToLink={mainWikiToLink}
            mainWikiToLinkSetter={mainWikiToLinkSetter}
            wikiPort={wikiPort}
            wikiPortSetter={wikiPortSetter}
            fileSystemPaths={fileSystemPaths}
            isCreateMainWorkspace={isCreateMainWorkspace}
          />

          <ExistedWikiDoneButton
            isCreateMainWorkspace={isCreateMainWorkspace}
            wikiPort={wikiPort}
            mainWikiToLink={mainWikiToLink}
            githubWikiUrl={githubWikiUrl}
            tagName={tagName}
            existedFolderLocation={existedFolderLocation}
            userInfo={userInfo}
          />
        </Container>
      )}
      {currentTab === 'CloneOnlineWiki' && (
        <Container>
          <NewWikiPathForm
            parentFolderLocation={parentFolderLocation}
            parentFolderLocationSetter={parentFolderLocationSetter}
            wikiFolderName={wikiFolderName}
            tagName={tagName}
            tagNameSetter={tagNameSetter}
            wikiFolderNameSetter={wikiFolderNameSetter}
            mainWikiToLink={mainWikiToLink}
            mainWikiToLinkSetter={mainWikiToLinkSetter}
            wikiPort={wikiPort}
            wikiPortSetter={wikiPortSetter}
            fileSystemPaths={fileSystemPaths}
            isCreateMainWorkspace={isCreateMainWorkspace}
          />
          <CloneWikiDoneButton
            isCreateMainWorkspace={isCreateMainWorkspace}
            wikiPort={wikiPort}
            mainWikiToLink={mainWikiToLink}
            githubWikiUrl={githubWikiUrl}
            wikiFolderName={wikiFolderName}
            tagName={tagName}
            parentFolderLocation={parentFolderLocation}
            userInfo={userInfo}
          />
        </Container>
      )}
    </ClientContext.Provider>
  );
}
