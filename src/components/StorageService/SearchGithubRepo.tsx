/* eslint-disable @typescript-eslint/no-misused-promises */
import Promise from 'bluebird';
import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, GraphQLClient, ClientContext } from 'graphql-hooks';
import { trim } from 'lodash';
import { useTranslation } from 'react-i18next';

import TextField from '@material-ui/core/TextField';
import FolderIcon from '@material-ui/icons/Folder';
import LinearProgress from '@material-ui/core/LinearProgress';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import Button from '@material-ui/core/Button';
import CachedIcon from '@material-ui/icons/Cached';
import CreateNewFolderIcon from '@material-ui/icons/CreateNewFolder';

import { GITHUB_GRAPHQL_API } from '@/constants/auth';
import { useUserInfoObservable } from '@services/auth/hooks';

const RepoSearchInput = styled(TextField)``;
const ReloadButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

const SEARCH_REPO_QUERY = `
  query SearchRepo($queryString: String!, $login: String!) {
    repositoryOwner(login: $login) {
      id
    }
    search(query: $queryString, type: REPOSITORY, first: 10) {
      repositoryCount
      edges {
        node {
          ... on Repository {
            name
            url
          }
        }
      }
    }
  }
`;
const CREATE_REPO_MUTATION = `
  mutation CreateRepository($repoName: String!, $homepageUrl: URI, $ownerId: ID!, $visibility: RepositoryVisibility!) {
    createRepository (input: {
      name: $repoName,
      description: "A non-linear Wiki created using TiddlyGit-Desktop.",
      hasIssuesEnabled: true,
      hasWikiEnabled: false,
      homepageUrl: $homepageUrl,
      ownerId: $ownerId,
      visibility: $visibility
    }) {
      repository {
        name
        homepageUrl
      }
    }
  }
`;

interface Props {
  githubWikiUrl: string;
  githubWikiUrlSetter: (value: string) => void;
  wikiFolderNameSetter: (value: string) => void;
  isCreateMainWorkspace: boolean;
}
export default function SearchGithubRepo(props: Props): JSX.Element {
  const userInfos = useUserInfoObservable();
  const githubUsername = userInfos?.['github-userName'];
  const accessToken = userInfos?.['github-token'];

  const { t } = useTranslation();

  if (githubUsername === '' || githubUsername === undefined || accessToken === '' || accessToken === undefined) {
    return <ListItemText>{t('AddWorkspace.WaitForLogin')}</ListItemText>;
  } else {
    return <SearchGithubRepoResultList {...props} githubUsername={githubUsername} accessToken={accessToken} />;
  }
}

interface ITokens {
  githubUsername: string;
  accessToken: string;
}
function SearchGithubRepoResultList({
  githubWikiUrl,
  githubWikiUrlSetter,
  wikiFolderNameSetter,
  isCreateMainWorkspace,
  githubUsername,
  accessToken,
}: Props & ITokens): JSX.Element {
  const { t } = useTranslation();
  const graphqlClient = useMemo(
    () =>
      new GraphQLClient({
        url: GITHUB_GRAPHQL_API,
      }),
    [],
  );

  const [githubRepoSearchString, githubRepoSearchStringSetter] = useState('wiki');
  const loadCount = 10;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { loading, error, data, refetch } = useQuery(SEARCH_REPO_QUERY, {
    variables: {
      first: loadCount,
      queryString: `user:${githubUsername} ${githubRepoSearchString}`,
      login: githubUsername,
    },
    skipCache: true,
  });
  // clear list on logout, which will cause accessToken change
  useEffect(() => {
    const timeoutHandle = setTimeout(async () => {
      await refetch();
    }, 100);
    return () => clearTimeout(timeoutHandle);
  }, [refetch, githubUsername, accessToken]);
  // try refetch on error
  const [retryInterval, retryIntervalSetter] = useState(100);
  useEffect(() => {
    if (error !== undefined && githubUsername !== undefined && githubUsername.length > 0 && accessToken !== undefined && accessToken.length > 0) {
      const timeoutHandle = setTimeout(async () => {
        await refetch();
        retryIntervalSetter(retryInterval * 10);
      }, retryInterval);
      return () => clearTimeout(timeoutHandle);
    }
    return () => {};
  }, [error, refetch, githubUsername, accessToken, retryInterval]);

  const [createRepository] = useMutation(CREATE_REPO_MUTATION);

  const repositoryCount = data?.search?.repositoryCount;
  let repoList = [];
  if ((repositoryCount ?? 0) > 0) {
    repoList = data.search.edges.map(({ node }) => node);
  }

  const [isCreatingRepo, isCreatingRepoSetter] = useState(false);
  const githubUserID = data?.repositoryOwner?.id;
  const wikiUrlToCreate = `https://github.com/${githubUsername ?? '???'}/${githubRepoSearchString}`;
  const isCreateNewRepo = trim(githubWikiUrl) === wikiUrlToCreate;
  const githubPagesUrl = `https://${githubUsername ?? '???'}.github.io/${githubRepoSearchString}`;

  let helperText = '';
  if (error !== undefined) {
    helperText = t('AddWorkspace.CanNotLoadList');
  }
  if (repositoryCount > loadCount) {
    helperText = t('AddWorkspace.OmitMoreResult', { loadCount });
  }

  return (
    <ClientContext.Provider value={graphqlClient}>
      <RepoSearchInput
        fullWidth
        onChange={(event) => {
          githubRepoSearchStringSetter(event.target.value);
        }}
        label={t('AddWorkspace.SearchGithubRepoName')}
        value={githubRepoSearchString}
        helperText={helperText}
      />
      {(loading || isCreatingRepo) && <LinearProgress variant="query" />}

      <List component="nav" aria-label="main mailbox folders">
        {repoList.map(({ name, url }) => (
          <ListItem
            button
            key={url}
            onClick={() => {
              githubWikiUrlSetter(url);
              wikiFolderNameSetter(name);
            }}
            selected={trim(githubWikiUrl) === trim(url)}>
            <ListItemIcon>
              <FolderIcon />
            </ListItemIcon>
            <ListItemText primary={name} />
          </ListItem>
        ))}
        {error === undefined && !loading && !isCreatingRepo && !repoList.some(({ url }) => trim(url) === wikiUrlToCreate) && githubRepoSearchString && (
          <ListItem
            button
            key={wikiUrlToCreate}
            onClick={async () => {
              isCreatingRepoSetter(true);
              await createRepository({
                variables: {
                  repoName: githubRepoSearchString,
                  homePageUrl: isCreateMainWorkspace ? githubPagesUrl : undefined,
                  ownerId: githubUserID,
                  visibility: isCreateMainWorkspace ? 'PUBLIC' : 'PRIVATE',
                },
              });
              // wait for Github update their db
              await Promise.delay(1000);
              await refetch();
              isCreatingRepoSetter(false);
              githubWikiUrlSetter(wikiUrlToCreate);
            }}
            selected={isCreateNewRepo}>
            <ListItemIcon>
              <CreateNewFolderIcon />
            </ListItemIcon>
            <ListItemText
              primary={`${
                isCreateMainWorkspace ? t('AddWorkspace.CreatePublicRepository') : t('AddWorkspace.CreatePrivateRepository')
              } ${githubRepoSearchString}`}
            />
          </ListItem>
        )}
      </List>
      {repoList.length === 0 && (
        <ReloadButton color="secondary" endIcon={<CachedIcon />} onClick={async () => await refetch()}>
          {t('AddWorkspace.Reload')}
        </ReloadButton>
      )}
    </ClientContext.Provider>
  );
}
