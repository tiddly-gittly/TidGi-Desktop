import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Accordion as AccordionRaw, AccordionDetails, AccordionSummary, AppBar, Box, Paper as PaperRaw, Tab as TabRaw, Tabs as TabsRaw } from '@mui/material';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';

import { SupportedStorageServices } from '@services/types';

import { MainSubWikiDescription, SyncedWikiDescription } from './Description';

import { CloneWikiDoneButton } from './CloneWikiDoneButton';
import { CloneWikiForm } from './CloneWikiForm';
import { ExistedWikiDoneButton } from './ExistedWikiDoneButton';
import { ExistedWikiForm } from './ExistedWikiForm';
import { NewWikiDoneButton } from './NewWikiDoneButton';
import { NewWikiForm } from './NewWikiForm';
import { IErrorInWhichComponent, useWikiWorkspaceForm } from './useForm';

import { TokenForm } from '@/components/TokenForm';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { IPossibleWindowMeta, WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { CreateWorkspaceTabs } from './constants';
import { GitRepoUrlForm } from './GitRepoUrlForm';
import { ImportHtmlWikiDoneButton } from './ImportHtmlWikiDoneButton';
import { ImportHtmlWikiForm } from './ImportHtmlWikiForm';

export const Paper = styled(PaperRaw)`
  border-color: ${({ theme }) => theme.palette.divider};
  background: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
` as unknown as typeof PaperRaw;
export const Accordion = styled(AccordionRaw)`
  border-color: ${({ theme }) => theme.palette.divider};
  background: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
` as unknown as typeof AccordionRaw;
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
const Tabs = styled(TabsRaw)`
  background: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.secondary};
`;
const Tab = styled(TabRaw)`
  background: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.secondary};
`;
const TabPanel = styled(Box)`
  margin-bottom: 10px;
  padding: 0;
`;
const AdvancedSettingsAccordionSummary = styled(AccordionSummary)`
  margin-top: 10px;
`;

export function AddWorkspace(): React.JSX.Element {
  const { t } = useTranslation();
  const [currentTab, currentTabSetter] = useState<CreateWorkspaceTabs>(
    (window.meta() as IPossibleWindowMeta<WindowMeta[WindowNames.addWorkspace]>).addWorkspaceTab ?? CreateWorkspaceTabs.CreateNewWiki,
  );
  const isCreateSyncedWorkspace = currentTab === CreateWorkspaceTabs.CloneOnlineWiki;
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
    form,
    isCreateMainWorkspace,
    errorInWhichComponent,
    errorInWhichComponentSetter,
  };

  if (workspaceList === undefined) {
    return <Container>{t('Loading')}</Container>;
  }

  return (
    <Box>
      <div id='test' data-usage='For spectron automating testing' />
      <Helmet>
        <title>
          {t('AddWorkspace.AddWorkspace')} {wikiFolderName}
        </title>
      </Helmet>
      <AppBar position='static'>
        <Paper square>
          <Tabs
            onChange={(_event: React.SyntheticEvent, newValue: CreateWorkspaceTabs) => {
              currentTabSetter(newValue);
            }}
            variant='scrollable'
            value={currentTab}
            aria-label={t('AddWorkspace.SwitchCreateNewOrOpenExisted')}
          >
            <Tab label={t('AddWorkspace.CreateNewWiki')} value={CreateWorkspaceTabs.CreateNewWiki} />
            <Tab label={t(`AddWorkspace.CloneOnlineWiki`)} value={CreateWorkspaceTabs.CloneOnlineWiki} />
            <Tab label={t('AddWorkspace.OpenLocalWiki')} value={CreateWorkspaceTabs.OpenLocalWiki} />
            <Tab label={t('AddWorkspace.OpenLocalWikiFromHTML')} value={CreateWorkspaceTabs.OpenLocalWikiFromHtml} />
          </Tabs>
        </Paper>
      </AppBar>

      {/* show advanced options if user have already created a workspace */}
      <Accordion defaultExpanded={workspaceList.length > 0}>
        <AdvancedSettingsAccordionSummary expandIcon={<ExpandMoreIcon />}>{t('AddWorkspace.Advanced')}</AdvancedSettingsAccordionSummary>
        <AccordionDetails>
          {/* Force it only show sync option when clone online wiki, because many user encounter sync problem here. Recommend them create local first and sync later. */}
          {isCreateSyncedWorkspace && <SyncedWikiDescription isCreateSyncedWorkspace={isCreateSyncedWorkspace} isCreateSyncedWorkspaceSetter={() => {}} />}
          <MainSubWikiDescription isCreateMainWorkspace={isCreateMainWorkspace} isCreateMainWorkspaceSetter={isCreateMainWorkspaceSetter} />
        </AccordionDetails>
      </Accordion>

      {isCreateSyncedWorkspace && (
        <TokenFormContainer>
          <TokenForm storageProvider={storageProvider} storageProviderSetter={storageProviderSetter} />
        </TokenFormContainer>
      )}
      {storageProvider !== SupportedStorageServices.local && <GitRepoUrlForm error={errorInWhichComponent.gitRepoUrl} {...formProps} {...formProps.form} />}

      {currentTab === CreateWorkspaceTabs.CreateNewWiki && (
        <TabPanel>
          <Container>
            <NewWikiForm {...formProps} isCreateSyncedWorkspace={isCreateSyncedWorkspace} />
            <NewWikiDoneButton {...formProps} isCreateSyncedWorkspace={isCreateSyncedWorkspace} />
          </Container>
        </TabPanel>
      )}
      {currentTab === CreateWorkspaceTabs.CloneOnlineWiki && (
        <TabPanel>
          <Container>
            <CloneWikiForm {...formProps} />
            <CloneWikiDoneButton {...formProps} />
          </Container>
        </TabPanel>
      )}
      {currentTab === CreateWorkspaceTabs.OpenLocalWiki && (
        <TabPanel>
          <Container>
            <ExistedWikiForm {...formProps} isCreateSyncedWorkspace={isCreateSyncedWorkspace} />
            <ExistedWikiDoneButton {...formProps} isCreateSyncedWorkspace={isCreateSyncedWorkspace} />
          </Container>
        </TabPanel>
      )}
      {currentTab === CreateWorkspaceTabs.OpenLocalWikiFromHtml && (
        <TabPanel>
          <Container>
            <ImportHtmlWikiForm {...formProps} isCreateSyncedWorkspace={isCreateSyncedWorkspace} />
            <ImportHtmlWikiDoneButton {...formProps} isCreateSyncedWorkspace={isCreateSyncedWorkspace} />
          </Container>
        </TabPanel>
      )}
    </Box>
  );
}
