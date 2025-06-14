import { Box, Tab as TabRaw, Tabs as TabsRaw } from '@mui/material';
import { keyframes, styled } from '@mui/material/styles';
import { SupportedStorageServices } from '@services/types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItemText } from '../ListItem';
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
  & ${Tabs} {
    min-width: 160px;
  }
`;
const backgroundColorShift = ({ theme }) =>
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
  storageProviderSetter?: (next: SupportedStorageServices) => void;
}
/**
 * Create storage provider's token.
 * @returns
 */
export function TokenForm({ storageProvider, storageProviderSetter }: Props): React.JSX.Element {
  const { t } = useTranslation();
  let [currentTab, currentTabSetter] = useState<SupportedStorageServices>(SupportedStorageServices.github);
  // use external controls if provided
  if (storageProvider !== undefined && typeof storageProviderSetter === 'function') {
    currentTab = storageProvider;
    currentTabSetter = storageProviderSetter as unknown as React.Dispatch<React.SetStateAction<SupportedStorageServices>>;
  }
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
            onChange={(event: React.SyntheticEvent, newValue: SupportedStorageServices) => {
              currentTabSetter(newValue);
            }}
            orientation='vertical'
            variant='scrollable'
            value={currentTab}
            aria-label='Vertical tabs example'
          >
            <Tab label='GitHub' value={SupportedStorageServices.github} />
            <Tab label='GitLab' value={SupportedStorageServices.gitlab} />
            <Tab label='Gitee' value={SupportedStorageServices.gitee} />
          </Tabs>
          {currentTab === SupportedStorageServices.github && (
            <TabPanel>
              <GitTokenForm storageService={SupportedStorageServices.github} />
            </TabPanel>
          )}
          {currentTab === SupportedStorageServices.gitlab && (
            <TabPanel>
              <GitTokenForm storageService={SupportedStorageServices.gitlab} />
            </TabPanel>
          )}
          {currentTab === SupportedStorageServices.gitee && (
            <TabPanel>
              Gitee（码云）一直不愿意支持 OAuth2 ，所以我们没法适配它的登录系统，如果你认识相关开发人员，请催促他们尽快支持，与国际接轨。
            </TabPanel>
          )}
        </TabsContainer>
      </Box>
    </Container>
  );
}
