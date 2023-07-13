/* eslint-disable @typescript-eslint/no-misused-promises */
import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import Promise from 'bluebird';
import { ClientContext, GraphQLClient, useMutation, useQuery } from 'graphql-hooks';
import { trim } from 'lodash';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { Button, LinearProgress, List, ListItem, ListItemIcon, ListItemText, TextField } from '@mui/material';
import { Cached as CachedIcon, CreateNewFolder as CreateNewFolderIcon, Folder as FolderIcon } from '@mui/icons-material';

import { GITHUB_GRAPHQL_API } from '@/constants/auth';
import { useUserInfoObservable } from '@services/auth/hooks';
import { IGithubSearchNode, IGithubSearchRepoQuery } from './interfaces';

const RepoSearchContainer = styled.div`
  margin-top: 20px;
`;
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
      description: "A non-linear Wiki created using TidGi-Desktop.",
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
  isCreateMainWorkspace: boolean;
  wikiFolderNameSetter?: (value: string) => void;
}
export default function SearchGithubRepo(props: Props): JSX.Element {
  const userInfos = useUserInfoObservable();
  const githubUsername = userInfos?.['github-userName'];
  const accessToken = userInfos?.['github-token'];

  const { t } = useTranslation();
  const graphqlClient = useMemo(
    () =>
      new GraphQLClient({
        url: GITHUB_GRAPHQL_API,
      }),
    [],
  );
  useEffect(() => {
    graphqlClient.setHeader('Authorization', accessToken === undefined ? '' : `Bearer ${accessToken}`);
  }, [accessToken, graphqlClient]);

  if (githubUsername === '' || githubUsername === undefined || accessToken === '' || accessToken === undefined) {
    return <ListItemText>{t('AddWorkspace.WaitForLogin')}</ListItemText>;
  } else {
    return (
      <ClientContext.Provider value={graphqlClient}>
        <SearchGithubRepoResultList {...props} githubUsername={githubUsername} accessToken={accessToken} />
      </ClientContext.Provider>
    );
  }
}

interface ITokens {
  accessToken: string;
  githubUsername: string;
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

  const onSelectRepo = useCallback(
    (url: string, name: string) => {
      githubWikiUrlSetter(url);
      typeof wikiFolderNameSetter === 'function' && wikiFolderNameSetter(name);
    },
    [githubWikiUrlSetter, wikiFolderNameSetter],
  );
  const [githubRepoSearchString, githubRepoSearchStringSetter] = useState('wiki');
  const loadCount = 10;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { loading, error, data, refetch } = useQuery<IGithubSearchRepoQuery>(SEARCH_REPO_QUERY, {
    variables: {
      first: loadCount,
      queryString: `user:${githubUsername} ${githubRepoSearchString}`,
      login: githubUsername,
    },
    skipCache: true,
  });
  const refetchDebounced = useDebouncedCallback(refetch, [], 300);
  // clear list on logout, which will cause accessToken change
  useEffect(() => {
    const timeoutHandle = setTimeout(async () => {
      await refetchDebounced();
    }, 100);
    return () => {
      clearTimeout(timeoutHandle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubUsername, accessToken]);
  // try refetch on error
  const [retryInterval, retryIntervalSetter] = useState(100);
  useEffect(() => {
    if (error !== undefined && githubUsername.length > 0 && accessToken.length > 0) {
      const timeoutHandle = setTimeout(async () => {
        await refetchDebounced();
        retryIntervalSetter(retryInterval * 10);
      }, retryInterval);
      return () => {
        clearTimeout(timeoutHandle);
      };
    }
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, githubUsername, accessToken, retryInterval]);

  const [createRepository] = useMutation(CREATE_REPO_MUTATION);

  const repositoryCount = data?.search?.repositoryCount;
  const repoList: IGithubSearchNode[] = useMemo(
    () => (data !== undefined && (repositoryCount ?? 0) > 0 ? data.search.edges.map(({ node }) => node) : []),
    [data, repositoryCount],
  );

  // auto select first one after first search
  useEffect(() => {
    if (githubWikiUrl?.length === 0 && repoList.length > 0) {
      onSelectRepo(repoList[0].url, repoList[0].name);
    }
  }, [repoList, githubWikiUrl, onSelectRepo]);

  const [isCreatingRepo, isCreatingRepoSetter] = useState(false);
  const githubUserID = data?.repositoryOwner?.id;
  const wikiUrlToCreate = `https://github.com/${githubUsername ?? '???'}/${githubRepoSearchString}`;
  const isCreateNewRepo = trim(githubWikiUrl) === wikiUrlToCreate;
  const githubPagesUrl = `https://${githubUsername ?? '???'}.github.io/${githubRepoSearchString}`;

  let helperText = '';
  if (error !== undefined) {
    helperText = t('AddWorkspace.CanNotLoadList');
  }
  if (repositoryCount !== undefined && repositoryCount > loadCount) {
    helperText = t('AddWorkspace.OmitMoreResult', { loadCount });
  }

  return (
    <RepoSearchContainer>
      <RepoSearchInput
        fullWidth
        onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          githubRepoSearchStringSetter(event.target.value);
        }}
        label={t('AddWorkspace.SearchGithubRepoName')}
        value={githubRepoSearchString}
        helperText={helperText}
      />
      {(loading || isCreatingRepo) && <LinearProgress variant='query' />}

      <List component='nav' aria-label='main mailbox folders'>
        {repoList.map(({ name, url }) => (
          <ListItem
            button
            key={url}
            onClick={() => {
              onSelectRepo(url, name);
            }}
            selected={trim(githubWikiUrl) === trim(url)}
          >
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
              await refetchDebounced();
              isCreatingRepoSetter(false);
              githubWikiUrlSetter(wikiUrlToCreate);
            }}
            selected={isCreateNewRepo}
          >
            <ListItemIcon>
              <CreateNewFolderIcon />
            </ListItemIcon>
            <ListItemText
              primary={`${isCreateMainWorkspace ? t('AddWorkspace.CreatePublicRepository') : t('AddWorkspace.CreatePrivateRepository')} ${githubRepoSearchString}`}
            />
          </ListItem>
        )}
      </List>
      {repoList.length === 0 && (
        <ReloadButton color='secondary' endIcon={<CachedIcon />} onClick={async () => await refetchDebounced()}>
          {t('AddWorkspace.Reload')}
        </ReloadButton>
      )}
    </RepoSearchContainer>
  );
}
