import { Box, Tab as TabRaw, Tabs as TabsRaw } from '@mui/material';
import { keyframes, styled, Theme } from '@mui/material/styles';
import { SupportedStorageServices } from '@services/types';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItemText } from '../ListItem';
import { CustomServerTokenForm } from './CustomServerTokenForm';
import { GitTokenForm } from './GitTokenForm';

const Container = styled('div')`
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: ${({ theme }) => theme.palette.background.paper};
`;
const TabPanel = styled(Box)`
  padding: 5px 0;
  padding-left: 16px;
  background-color: ${({ theme }) => theme.palette.background.paper};
`;
const Tabs = styled(TabsRaw)`
  background-color: ${({ theme }) => theme.palette.background.paper};
  & button {
    background-color: ${({ theme }) => theme.palette.background.paper} !important;
  }
`;
const TabsContainer = styled('div')`
  background-color: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
  display: flex;
  padding: 15px 0;
  flex-direction: row;
  & .MuiTabs-root {
    min-width: 160px;
  }
`;
const backgroundColorShift = ({ theme }: { theme: Theme }) =>
  keyframes`
from {background-color: ${theme.palette.background.default};}
  to {background-color: ${theme.palette.background.default};}
`;
const Tab = styled(TabRaw)`
  background-color: ${({ theme }) => theme.palette.action.active};
  color: ${({ theme }) => theme.palette.text.secondary};
  animation: ${backgroundColorShift} 5s infinite;
  animation-direction: alternate;
  animation-timing-function: cubic-bezier(0.4, 0, 1, 1);
`;

interface Props {
  storageProvider?: SupportedStorageServices;
  storageProviderSetter?: (value: SupportedStorageServices) => void;
}
/**
 * Create storage provider's token.
 * @returns
 */
export function TokenForm({ storageProvider, storageProviderSetter }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [internalTab, internalTabSetter] = useState<SupportedStorageServices>(SupportedStorageServices.github);
  // use external controls if provided
  const currentTab = storageProvider ?? internalTab;
  const currentTabSetter = storageProviderSetter ?? internalTabSetter;
  // update storageProvider to be an online service, if this Component is opened
  useEffect(() => {
    if (storageProvider === SupportedStorageServices.local && typeof storageProviderSetter === 'function') {
      storageProviderSetter(SupportedStorageServices.github);
    }
  }, [storageProvider, storageProviderSetter]);
  return (
    <Container>
      <ListItemText primary={t('Preference.Token')} secondary={t('Preference.TokenDescription')} />
      <Box sx={{ display: 'flex', width: '100%' }}>
        <TabsContainer>
          <Tabs
            onChange={(_event: React.SyntheticEvent, newValue: SupportedStorageServices) => {
              currentTabSetter(newValue);
            }}
            orientation='vertical'
            variant='scrollable'
            value={currentTab}
            aria-label='Vertical tabs example'
          >
            <Tab label='GitHub' value={SupportedStorageServices.github} data-testid='github-tab' />
            <Tab label='Codeberg' value={SupportedStorageServices.codeberg} data-testid='codeberg-tab' />
            <Tab label='Gitea.com' value={SupportedStorageServices.gitea} data-testid='gitea-tab' />
            <Tab label='Custom Server' value={SupportedStorageServices.testOAuth} data-testid='custom-server-tab' />
          </Tabs>
          {currentTab === SupportedStorageServices.github && (
            <TabPanel>
              <GitTokenForm storageService={SupportedStorageServices.github} />
            </TabPanel>
          )}
          {currentTab === SupportedStorageServices.codeberg && (
            <TabPanel>
              <GitTokenForm storageService={SupportedStorageServices.codeberg} />
            </TabPanel>
          )}
          {currentTab === SupportedStorageServices.gitea && (
            <TabPanel>
              <GitTokenForm storageService={SupportedStorageServices.gitea} />
            </TabPanel>
          )}
          {currentTab === SupportedStorageServices.testOAuth && (
            <TabPanel>
              <CustomServerTokenForm />
            </TabPanel>
          )}
        </TabsContainer>
      </Box>
    </Container>
  );
}
