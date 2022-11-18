import React, { useState, useEffect } from 'react';
import styled, { css } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet';
import { Accordion as AccordionRaw, AccordionSummary, AccordionDetails, AppBar, Paper as PaperRaw, Tab as TabRaw } from '@material-ui/core';
import { TabPanel as TabPanelRaw, TabContext, TabList as TabListRaw } from '@material-ui/lab';
import { ExpandMore as ExpandMoreIcon } from '@material-ui/icons';

import { SupportedStorageServices } from '@services/types';

import { MainSubWikiDescription, SyncedWikiDescription } from './Description';

import { NewWikiForm } from './NewWikiForm';
import { NewWikiDoneButton } from './NewWikiDoneButton';
import { ExistedWikiForm } from './ExistedWikiForm';
import { ExistedWikiDoneButton } from './ExistedWikiDoneButton';
import { CloneWikiForm } from './CloneWikiForm';
import { CloneWikiDoneButton } from './CloneWikiDoneButton';
import { IErrorInWhichComponent, useIsCreateSyncedWorkspace, useWikiWorkspaceForm } from './useForm';

import { TokenForm } from '@/components/TokenForm';
// import { useAuthing, useTokenFromAuthingRedirect } from '@/components/TokenForm/gitTokenHooks';
import { GitRepoUrlForm } from './GitRepoUrlForm';
import { LocationPickerContainer, LocationPickerInput } from './FormComponents';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { ImportHtmlWikiForm } from './ImportHtmlWikiForm';
import { ImportHtmlWikiDoneButton } from './ImportHtmlWikiDoneButton';

enum CreateWorkspaceTabs {
  CloneOnlineWiki = 'CloneOnlineWiki',
  CreateNewWiki = 'CreateNewWiki',
  OpenLocalWiki = 'OpenLocalWiki',
  OpenLocalWikiFromHtml = 'OpenLocalWikiFromHtml',
}

export const Paper = styled(PaperRaw)`
  border-color: ${({ theme }) => theme.palette.divider};
  background: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
`;
export const Accordion = styled(AccordionRaw)`
  border-color: ${({ theme }) => theme.palette.divider};
  background: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
`;
const Container = styled.main`
  display: flex;
  flex-direction: column;
  overflow: scroll;
  &::-webkit-scrollbar {
    width: 0;
  }
`;
const TokenFormContainer = styled(Paper)`
  margin: 10px 0;
  padding: 5px 10px;
  background-color: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
`;
TokenFormContainer.defaultProps = {
  square: true,
  elevation: 2,
};
const TabList = styled(TabListRaw)`
  background: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.secondary};
`;
const Tab = styled(TabRaw)`
  background: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.secondary};
`;
const TabPanel = styled(TabPanelRaw)`
  margin-bottom: 10px;
  padding: 0 !important;
`;
const AdvancedSettingsAccordionSummary = styled(AccordionSummary)`
  margin-top: 10px;
`;

export function AddWorkspace(): JSX.Element {
  const { t } = useTranslation();
  const [currentTab, currentTabSetter] = useState<CreateWorkspaceTabs>(CreateWorkspaceTabs.CreateNewWiki);
  const [isCreateSyncedWorkspace, isCreateSyncedWorkspaceSetter] = useIsCreateSyncedWorkspace();
  const [isCreateMainWorkspace, isCreateMainWorkspaceSetter] = useState(true);
  const form = useWikiWorkspaceForm();
  const [errorInWhichComponent, errorInWhichComponentSetter] = useState<IErrorInWhichComponent>({});
  const workspaceList = usePromiseValue(async () => await window.service.workspace.getWorkspacesAsList());

  // update storageProviderSetter to local based on isCreateSyncedWorkspace. Other services value will be changed by TokenForm
  const { storageProvider, storageProviderSetter, wikiFolderName, wikiPort } = form;
  useEffect(() => {
    if (!isCreateSyncedWorkspace && storageProvider !== SupportedStorageServices.local) {
      storageProviderSetter(SupportedStorageServices.local);
    }
  }, [isCreateSyncedWorkspace, storageProvider, storageProviderSetter]);

  // const [onClickLogin] = useAuth(storageService);

  const formProps = {
    form: form,
    isCreateMainWorkspace: isCreateMainWorkspace,
    errorInWhichComponent: errorInWhichComponent,
    errorInWhichComponentSetter: errorInWhichComponentSetter,
  };

  if (workspaceList === undefined) {
    return <Container>{t('Loading')}</Container>;
  }

  return (
    <TabContext value={currentTab}>
      <div id="test" data-usage="For spectron automating testing" />
      <Helmet>
        <title>
          {t('AddWorkspace.AddWorkspace')} {wikiFolderName}
        </title>
      </Helmet>
      <AppBar position="static">
        <Paper square>
          <TabList
            onChange={(_event, newValue) => currentTabSetter(newValue as CreateWorkspaceTabs)}
            variant="scrollable"
            value={currentTab}
            aria-label={t('AddWorkspace.SwitchCreateNewOrOpenExisted')}>
            <Tab label={t('AddWorkspace.CreateNewWiki')} value={CreateWorkspaceTabs.CreateNewWiki} />
            <Tab label={t(`AddWorkspace.CloneOnlineWiki`)} value={CreateWorkspaceTabs.CloneOnlineWiki} />
            <Tab label={t('AddWorkspace.OpenLocalWiki')} value={CreateWorkspaceTabs.OpenLocalWiki} />
            <Tab label={t('AddWorkspace.OpenLocalWikiFromHTML')} value={CreateWorkspaceTabs.OpenLocalWikiFromHtml} />
          </TabList>
        </Paper>
      </AppBar>

      {/* show advanced options if user have already created a workspace */}
      <Accordion defaultExpanded={workspaceList.length > 0}>
        <AdvancedSettingsAccordionSummary expandIcon={<ExpandMoreIcon />}>{t('AddWorkspace.Advanced')}</AdvancedSettingsAccordionSummary>
        <AccordionDetails>
          <SyncedWikiDescription isCreateSyncedWorkspace={isCreateSyncedWorkspace} isCreateSyncedWorkspaceSetter={isCreateSyncedWorkspaceSetter} />
          <MainSubWikiDescription isCreateMainWorkspace={isCreateMainWorkspace} isCreateMainWorkspaceSetter={isCreateMainWorkspaceSetter} />
          {isCreateMainWorkspace && (
            <LocationPickerContainer>
              <LocationPickerInput
                error={errorInWhichComponent.wikiPort}
                onChange={(event) => {
                  form.wikiPortSetter(Number(event.target.value));
                }}
                label={t('AddWorkspace.WikiServerPort')}
                value={wikiPort}
              />
            </LocationPickerContainer>
          )}
        </AccordionDetails>
      </Accordion>

      {isCreateSyncedWorkspace && (
        <TokenFormContainer>
          <TokenForm storageProvider={storageProvider} storageProviderSetter={storageProviderSetter} />
        </TokenFormContainer>
      )}
      {storageProvider !== SupportedStorageServices.local && <GitRepoUrlForm error={errorInWhichComponent.gitRepoUrl} {...formProps} {...formProps.form} />}

      <TabPanel value={CreateWorkspaceTabs.CreateNewWiki}>
        <Container>
          <NewWikiForm {...formProps} isCreateSyncedWorkspace={isCreateSyncedWorkspace} />
          <NewWikiDoneButton {...formProps} isCreateSyncedWorkspace={isCreateSyncedWorkspace} />
        </Container>
      </TabPanel>
      <TabPanel value={CreateWorkspaceTabs.CloneOnlineWiki}>
        <Container>
          <CloneWikiForm {...formProps} isCreateSyncedWorkspaceSetter={isCreateSyncedWorkspaceSetter} />
          <CloneWikiDoneButton {...formProps} />
        </Container>
      </TabPanel>
      <TabPanel value={CreateWorkspaceTabs.OpenLocalWiki}>
        <Container>
          <ExistedWikiForm {...formProps} isCreateSyncedWorkspace={isCreateSyncedWorkspace} />
          <ExistedWikiDoneButton {...formProps} isCreateSyncedWorkspace={isCreateSyncedWorkspace} />
        </Container>
      </TabPanel>
      <TabPanel value={CreateWorkspaceTabs.OpenLocalWikiFromHtml}>
        <Container>
          <ImportHtmlWikiForm {...formProps} isCreateSyncedWorkspace={isCreateSyncedWorkspace} />
          <ImportHtmlWikiDoneButton {...formProps} isCreateSyncedWorkspace={isCreateSyncedWorkspace} />
        </Container>
      </TabPanel>
    </TabContext>
  );
}
