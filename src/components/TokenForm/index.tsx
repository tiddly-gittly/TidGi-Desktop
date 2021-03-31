import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Paper, Typography } from '@material-ui/core';
import SearchRepo from '@/components/github/SearchRepo';

import { GithubTokenForm } from '../github/git-token-form';

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

export function TokenForm(): JSX.Element {
  return (
    <SyncContainer elevation={2} square>
    <GithubTokenForm>
      {githubWikiUrl?.length > 0 ? (
        <GithubRepoLink onClick={async () => await window.service.native.open(githubWikiUrl)} variant="subtitle2" align="center">
          ({githubWikiUrl})
        </GithubRepoLink>
      ) : undefined}
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
  )
}