import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { AppBar, Paper, Tab } from '@material-ui/core';
import { TabPanel as TabPanelRaw, TabContext, TabList } from '@material-ui/lab';

import { TokenForm } from '@/components/TokenForm';

import { MainSubWikiDescription, SyncedWikiDescription } from './Description';

import { NewWikiForm } from './NewWikiForm';
import { NewWikiDoneButton } from './NewWikiDoneButton';
import { ExistedWikiForm } from './ExistedWikiForm';
import { ExistedWikiDoneButton } from './ExistedWikiDoneButton';
import { CloneWikiForm } from './CloneWikiForm';
import { CloneWikiDoneButton } from './CloneWikiDoneButton';

import { useIsCreateMainWorkspace, useIsCreateSyncedWorkspace, useWikiWorkspaceForm } from './useForm';
import { useAuthing, useTokenFromAuthingRedirect } from '@/components/TokenForm/gitTokenHooks';
import { SupportedStorageServices } from '@services/types';

enum CreateWorkspaceTabs {
  CloneOnlineWiki = 'CloneOnlineWiki',
  CreateNewWiki = 'CreateNewWiki',
  OpenLocalWiki = 'OpenLocalWiki',
}

const Container = styled.main`
  display: flex;
  flex-direction: column;
  overflow: scroll;
  &::-webkit-scrollbar {
    width: 0;
  }
`;
const TokenFormContainer = styled(Paper)`
  margin-bottom: 10px;
  padding: 5px 10px;
`;
TokenFormContainer.defaultProps = {
  square: true,
  elevation: 2,
};
const TabPanel = styled(TabPanelRaw)`
  margin-bottom: 10px;
  padding: 0 !important;
`;

export default function AddWorkspace(): JSX.Element {
  const { t } = useTranslation();
  const [currentTab, currentTabSetter] = useState<CreateWorkspaceTabs>(CreateWorkspaceTabs.CreateNewWiki);
  const [isCreateSyncedWorkspace, isCreateSyncedWorkspaceSetter] = useIsCreateSyncedWorkspace();
  const [isCreateMainWorkspace, isCreateMainWorkspaceSetter] = useIsCreateMainWorkspace();
  const form = useWikiWorkspaceForm();

  const authing = useAuthing();
  useTokenFromAuthingRedirect(
    authing,
    useCallback(() => isCreateSyncedWorkspaceSetter(true), [isCreateSyncedWorkspaceSetter]),
  );

  return (
    <TabContext value={currentTab}>
      <AppBar position="static">
        <Paper square>
          <TabList
            onChange={(_event, newValue) => currentTabSetter(newValue as CreateWorkspaceTabs)}
            variant="scrollable"
            value={currentTab}
            aria-label={t('AddWorkspace.SwitchCreateNewOrOpenExisted')}>
            <Tab label={t(`AddWorkspace.CloneOnlineWiki`)} value={CreateWorkspaceTabs.CloneOnlineWiki} />
            <Tab label={t('AddWorkspace.CreateNewWiki')} value={CreateWorkspaceTabs.CreateNewWiki} />
            <Tab label={t('AddWorkspace.OpenLocalWiki')} value={CreateWorkspaceTabs.OpenLocalWiki} />
          </TabList>
        </Paper>
      </AppBar>

      <SyncedWikiDescription isCreateSyncedWorkspace={isCreateSyncedWorkspace} isCreateSyncedWorkspaceSetter={isCreateSyncedWorkspaceSetter} />
      {isCreateSyncedWorkspace && (
        <TokenFormContainer>
          <TokenForm storageProvider={form.storageProvider} storageProviderSetter={form.storageProviderSetter} />
        </TokenFormContainer>
      )}

      <MainSubWikiDescription isCreateMainWorkspace={isCreateMainWorkspace} isCreateMainWorkspaceSetter={isCreateMainWorkspaceSetter} />
      <TabPanel value={CreateWorkspaceTabs.CloneOnlineWiki}>
        <Container>
          <NewWikiForm form={form} isCreateMainWorkspace={isCreateMainWorkspace} />
          <NewWikiDoneButton form={form} isCreateMainWorkspace={isCreateMainWorkspace} />
        </Container>
      </TabPanel>
      <TabPanel value={CreateWorkspaceTabs.CreateNewWiki}>
        <ExistedWikiForm form={form} isCreateMainWorkspace={isCreateMainWorkspace} />
        <ExistedWikiDoneButton form={form} isCreateMainWorkspace={isCreateMainWorkspace} />
      </TabPanel>
      <TabPanel value={CreateWorkspaceTabs.OpenLocalWiki}>
        <CloneWikiForm form={form} isCreateMainWorkspace={isCreateMainWorkspace} />
        <CloneWikiDoneButton form={form} isCreateMainWorkspace={isCreateMainWorkspace} />
      </TabPanel>
    </TabContext>
  );
}
