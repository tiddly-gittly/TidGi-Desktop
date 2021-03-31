import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { GraphQLClient, ClientContext } from 'graphql-hooks';

import { GITHUB_GRAPHQL_API } from '../../constants/auth';

import Description from './description-and-mode-switch';

import NewWikiDoneButton from './new-wiki-done-button';
import NewWikiPathForm from './new-wiki-path-form';
import ExistedWikiPathForm from './existed-wiki-path-form';
import ExistedWikiDoneButton from './existed-wiki-done-button';
import CloneWikiDoneButton from './clone-wiki-done-button';

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

      {currentTab === 'CreateNewWiki' && (
        <Container>
          <NewWikiPathForm form={form} />

          <NewWikiDoneButton form={form} />
        </Container>
      )}
      {currentTab === 'OpenLocalWiki' && (
        <Container>
          <ExistedWikiPathForm form={form} />

          <ExistedWikiDoneButton form={form} />
        </Container>
      )}
      {currentTab === 'CloneOnlineWiki' && (
        <Container>
          <NewWikiPathForm form={form} />
          <CloneWikiDoneButton form={form} />
        </Container>
      )}
    </ClientContext.Provider>
  );
}
