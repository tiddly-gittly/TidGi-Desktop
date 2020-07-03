// @flow
import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery } from 'graphql-hooks';

import TextField from '@material-ui/core/TextField';
import FolderIcon from '@material-ui/icons/Folder';
import LinearProgress from '@material-ui/core/LinearProgress';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';

const RepoSearchInput = styled(TextField)``;

const SEARCH_REPO_QUERY = `
  query SearchRepo($queryString: String!) {
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
export default function SearchRepo() {
  const [githubRepoSearchString, githubRepoSearchStringSetter] = useState('wiki');
  const loadCount = 10;
  const { loading, error, data } = useQuery(SEARCH_REPO_QUERY, {
    variables: {
      first: loadCount,
      queryString: `user:linonetwo ${githubRepoSearchString}`,
    },
  });
  const repositoryCount = data?.search?.repositoryCount;
  let repoList = [];
  if (repositoryCount) {
    repoList = data.search.edges.map(({ node }) => node);
  }
  let helperText = '';
  if (error) {
    helperText = '无法加载仓库列表，网络不佳';
  }
  if (repositoryCount > loadCount) {
    helperText = `仅展示前${loadCount}个结果`;
  }

  return (
    <>
      <RepoSearchInput
        fullWidth
        onChange={event => {
          githubRepoSearchStringSetter(event.target.value);
        }}
        label="搜索Github仓库名"
        value={githubRepoSearchString}
        helperText={helperText}
      />
      {loading && <LinearProgress variant="query" />}
      <List component="nav" aria-label="main mailbox folders">
        {repoList.map(({ name, url }) => (
          <ListItem button key={url}>
            <ListItemIcon>
              <FolderIcon />
            </ListItemIcon>
            <ListItemText primary={name} />
          </ListItem>
        ))}
      </List>
    </>
  );
}
