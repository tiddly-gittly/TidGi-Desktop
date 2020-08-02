// @flow
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation } from 'graphql-hooks';
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

import type { IUserInfo } from './user-info';

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

type Props = {|
  accessToken?: string,
  githubWikiUrl: string,
  githubWikiUrlSetter: string => void,
  userInfo?: IUserInfo,
  isCreateMainWorkspace: boolean,
|};
export default function SearchRepo({
  accessToken,
  githubWikiUrl,
  githubWikiUrlSetter,
  userInfo,
  isCreateMainWorkspace,
}: Props) {
  const [githubRepoSearchString, githubRepoSearchStringSetter] = useState('wiki');
  const loadCount = 10;
  const githubUsername = userInfo?.login || '';
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
    const timeoutHandle = setTimeout(() => {
      refetch();
    }, 100);
    return () => clearTimeout(timeoutHandle);
  }, [refetch, githubUsername, accessToken]);
  // try refetch on error
  const [retryInterval, retryIntervalSetter] = useState(100);
  useEffect(() => {
    if (error && githubUsername && accessToken) {
      const timeoutHandle = setTimeout(() => {
        refetch();
        retryIntervalSetter(retryInterval * 10);
      }, retryInterval);
      return () => clearTimeout(timeoutHandle);
    }
    return () => {};
  }, [error, refetch, githubUsername, accessToken, retryInterval]);

  const [createRepository] = useMutation(CREATE_REPO_MUTATION);

  const repositoryCount = data?.search?.repositoryCount;
  let repoList = [];
  if (repositoryCount) {
    repoList = data.search.edges.map(({ node }) => node);
  }
  const { t } = useTranslation();
  let helperText = '';
  const notLogin = !githubUsername || !accessToken;
  if (notLogin) {
    helperText = t('AddWorkspace.WaitForLogin');
  } else if (error) {
    helperText = t('AddWorkspace.CanNotLoadList');
  }
  if (repositoryCount > loadCount) {
    helperText = t('AddWorkspace.OmitMoreResult', { loadCount });
  }

  const [isCreatingRepo, isCreatingRepoSetter] = useState(false);
  const githubUserID = data?.repositoryOwner?.id;
  const wikiUrlToCreate = `https://github.com/${userInfo?.login || '???'}/${githubRepoSearchString}`;
  const isCreateNewRepo = trim(githubWikiUrl) === wikiUrlToCreate;
  const githubPagesUrl = `https://${userInfo?.login || '???'}.github.io/${githubRepoSearchString}`;

  return (
    <>
      <RepoSearchInput
        fullWidth
        onChange={event => {
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
            onClick={() => githubWikiUrlSetter(url)}
            selected={trim(githubWikiUrl) === trim(url)}
          >
            <ListItemIcon>
              <FolderIcon />
            </ListItemIcon>
            <ListItemText primary={name} />
          </ListItem>
        ))}
        {userInfo &&
          !notLogin &&
          !error &&
          !loading &&
          !isCreatingRepo &&
          !repoList.some(({ url }) => trim(url) === wikiUrlToCreate) &&
          githubRepoSearchString && (
            <ListItem
              button
              key={wikiUrlToCreate}
              onClick={async () => {
                githubWikiUrlSetter(wikiUrlToCreate);
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
                setTimeout(async () => {
                  await refetch();
                  isCreatingRepoSetter(false);
                }, 1000);
              }}
              selected={isCreateNewRepo}
            >
              <ListItemIcon>
                <CreateNewFolderIcon />
              </ListItemIcon>
              <ListItemText
                primary={`${
                  isCreateMainWorkspace
                    ? t('AddWorkspace.CreatePublicRepository')
                    : t('AddWorkspace.CreatePrivateRepository')
                } ${githubRepoSearchString}`}
              />
            </ListItem>
          )}
      </List>
      {repoList.length === 0 && !notLogin && (
        <ReloadButton color="secondary" endIcon={<CachedIcon />} onClick={() => refetch()}>
          {t('AddWorkspace.Reload')}
        </ReloadButton>
      )}
    </>
  );
}
