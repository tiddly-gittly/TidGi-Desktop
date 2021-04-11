import React, { useState } from 'react';
import styled from 'styled-components';
import { GraphQLClient, ClientContext } from 'graphql-hooks';

import { GITHUB_GRAPHQL_API } from '../../constants/auth';

import { TokenForm } from '@/components/TokenForm';

import { Description } from './Description';

import { NewWikiForm } from './NewWikiForm';
import { NewWikiDoneButton } from './NewWikiDoneButton';
import { ExistedWikiForm } from './ExistedWikiForm';
import { ExistedWikiDoneButton } from './ExistedWikiDoneButton';
import { CloneWikiForm } from './CloneWikiForm';
import { CloneWikiDoneButton } from './CloneWikiDoneButton';

import { TabBar, CreateWorkspaceTabs } from './TabBar';
import { useIsCreateMainWorkspace, useWikiWorkspaceForm } from './useForm';

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

export default function AddWorkspace(): JSX.Element {
  const [currentTab, currentTabSetter] = useState<CreateWorkspaceTabs>(CreateWorkspaceTabs.CreateNewWiki);
  const [isCreateMainWorkspace, isCreateMainWorkspaceSetter] = useIsCreateMainWorkspace();

  const form = useWikiWorkspaceForm();

  return (
    <ClientContext.Provider value={graphqlClient}>
      <TabBar currentTab={currentTab} currentTabSetter={currentTabSetter} />
      <Description isCreateMainWorkspace={isCreateMainWorkspace} isCreateMainWorkspaceSetter={isCreateMainWorkspaceSetter} />

      <TokenForm />

      {currentTab === 'CreateNewWiki' && (
        <Container>
          <NewWikiForm form={form} isCreateMainWorkspace={isCreateMainWorkspace} />
          <NewWikiDoneButton form={form} isCreateMainWorkspace={isCreateMainWorkspace} />
        </Container>
      )}
      {currentTab === 'OpenLocalWiki' && (
        <Container>
          <ExistedWikiForm form={form} isCreateMainWorkspace={isCreateMainWorkspace} />
          <ExistedWikiDoneButton form={form} isCreateMainWorkspace={isCreateMainWorkspace} />
        </Container>
      )}
      {currentTab === 'CloneOnlineWiki' && (
        <Container>
          <CloneWikiForm form={form} isCreateMainWorkspace={isCreateMainWorkspace} />
          <CloneWikiDoneButton form={form} isCreateMainWorkspace={isCreateMainWorkspace} />
        </Container>
      )}
    </ClientContext.Provider>
  );
}
