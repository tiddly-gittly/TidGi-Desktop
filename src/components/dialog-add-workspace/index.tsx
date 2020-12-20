import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { GraphQLClient, ClientContext } from 'graphql-hooks';

import Typography from '@material-ui/core/Typography';
import Paper from '@material-ui/core/Paper';

import { GITHUB_GRAPHQL_API } from '../../constants/auth';

// @ts-expect-error ts-migrate(6142) FIXME: Module './description-and-mode-switch' was resolve... Remove this comment to see the full error message
import Description from './description-and-mode-switch';
// @ts-expect-error ts-migrate(6142) FIXME: Module './search-repo' was resolved to '/Users/lin... Remove this comment to see the full error message
import SearchRepo from './search-repo';
// @ts-expect-error ts-migrate(6142) FIXME: Module './new-wiki-done-button' was resolved to '/... Remove this comment to see the full error message
import NewWikiDoneButton from './new-wiki-done-button';
// @ts-expect-error ts-migrate(6142) FIXME: Module './new-wiki-path-form' was resolved to '/Us... Remove this comment to see the full error message
import NewWikiPathForm from './new-wiki-path-form';
// @ts-expect-error ts-migrate(6142) FIXME: Module './existed-wiki-path-form' was resolved to ... Remove this comment to see the full error message
import ExistedWikiPathForm from './existed-wiki-path-form';
// @ts-expect-error ts-migrate(6142) FIXME: Module './existed-wiki-done-button' was resolved t... Remove this comment to see the full error message
import ExistedWikiDoneButton from './existed-wiki-done-button';
// @ts-expect-error ts-migrate(6142) FIXME: Module './clone-wiki-done-button' was resolved to ... Remove this comment to see the full error message
import CloneWikiDoneButton from './clone-wiki-done-button';
import { getGithubUserInfo, setGithubUserInfo } from '../../helpers/user-info';
import type { IUserInfo } from '../../helpers/user-info';
// @ts-expect-error ts-migrate(6142) FIXME: Module './tab-bar' was resolved to '/Users/linonet... Remove this comment to see the full error message
import TabBar from './tab-bar';
// @ts-expect-error ts-migrate(6142) FIXME: Module '../shared/git-token-form' was resolved to ... Remove this comment to see the full error message
import GitTokenForm, { getGithubToken, setGithubToken } from '../shared/git-token-form';

import { requestOpen, getDesktopPath, countWorkspace, getWorkspaceRemote, getSubWikiPluginContent } from '../../senders';

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

const setHeaderToGraphqlClient = (token: string) => graphqlClient.setHeader('Authorization', `bearer ${token}`);
const previousToken = getGithubToken();
previousToken && setHeaderToGraphqlClient(previousToken);

export default function AddWorkspace() {
  const [currentTab, currentTabSetter] = useState('CloneOnlineWiki');
  const [isCreateMainWorkspace, isCreateMainWorkspaceSetter] = useState(countWorkspace() === 0);
  const [parentFolderLocation, parentFolderLocationSetter] = useState(getDesktopPath());
  const [existedFolderLocation, existedFolderLocationSetter] = useState(getDesktopPath());
  const [wikiPort, wikiPortSetter] = useState(5212 + countWorkspace());

  // try get token on start up, so Github GraphQL client can use it
  const [accessToken, accessTokenSetter] = useState<string | void>(previousToken);
  // try get token from local storage, and set to state for gql to use
  useEffect(() => {
    if (accessToken) {
      graphqlClient.setHeader('Authorization', `bearer ${accessToken}`);
      setGithubToken(accessToken);
    } else {
      Object.keys(graphqlClient.headers).map((key) => graphqlClient.removeHeader(key));
      setGithubToken();
    }
  }, [accessToken]);

  const [userInfo, userInfoSetter] = useState<IUserInfo | void>(getGithubUserInfo());
  useEffect(() => {
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'void | IUserInfo' is not assigna... Remove this comment to see the full error message
    setGithubUserInfo(userInfo);
  }, [userInfo]);

  const [mainWikiToLink, mainWikiToLinkSetter] = useState({ name: '', port: 0 });
  const [tagName, tagNameSetter] = useState<string>('');
  const [fileSystemPaths, fileSystemPathsSetter] = useState([]);
  useEffect(() => {
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'Dispatch<SetStateAction<never[]>... Remove this comment to see the full error message
    // eslint-disable-next-line promise/catch-or-return
    getSubWikiPluginContent(mainWikiToLink.name).then(fileSystemPathsSetter);
  }, [mainWikiToLink]);
  const [githubWikiUrl, githubWikiUrlSetter] = useState<string>('');
  useEffect(() => {
    async function getWorkspaceRemoteInEffect() {
      const url = await getWorkspaceRemote(existedFolderLocation);
      url && githubWikiUrlSetter(url);
    }
    getWorkspaceRemoteInEffect();
  }, [githubWikiUrl, existedFolderLocation]);

  const [wikiFolderName, wikiFolderNameSetter] = useState('tiddlywiki');

  return (
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <ClientContext.Provider value={graphqlClient}>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <TabBar currentTab={currentTab} currentTabSetter={currentTabSetter} />
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Description isCreateMainWorkspace={isCreateMainWorkspace} isCreateMainWorkspaceSetter={isCreateMainWorkspaceSetter} />
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <SyncContainer elevation={2} square>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <GitTokenForm accessTokenSetter={accessTokenSetter} userInfoSetter={userInfoSetter} accessToken={accessToken}>
          {githubWikiUrl && (
            // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <GithubRepoLink onClick={() => requestOpen(githubWikiUrl)} variant="subtitle2" align="center">
              ({githubWikiUrl})
            </GithubRepoLink>
          )}
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <SearchRepo
            githubWikiUrl={githubWikiUrl}
            accessToken={accessToken}
            githubWikiUrlSetter={githubWikiUrlSetter}
            userInfo={userInfo}
            currentTab={currentTab}
            wikiFolderNameSetter={wikiFolderNameSetter}
            isCreateMainWorkspace={isCreateMainWorkspace}
          />
        </GitTokenForm>
      </SyncContainer>

      {currentTab === 'CreateNewWiki' && (
        // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Container>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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

          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
        // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Container>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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

          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
        // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Container>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
