import AddIcon from '@mui/icons-material/Add';
import ChatIcon from '@mui/icons-material/Chat';
import { Box, Card, Typography } from '@mui/material';
import { Grid } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { TEMP_TAB_ID_PREFIX } from '@/pages/Agent/constants/tab';
import { useTabStore } from '@/pages/Agent/store/tabStore';
import { TabType } from '@/pages/Agent/types/tab';
import { Search } from '../../components/Search/Search';
import { INewTab } from '../../types/tab';

interface NewTabContentProps {
  tab: INewTab;
}

const Container = styled(Box)`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 32px;
  overflow-y: auto;
  background-color: ${props => props.theme.palette.background.default};
`;

const SearchContainer = styled(Box)`
  max-width: 600px;
  margin: 24px auto 40px;
`;

const SectionTitle = styled(Typography)`
  margin-bottom: 16px;
  font-weight: 600;
`;

const QuickAccessGrid = styled(Box)`
  margin-bottom: 40px;
`;

const ShortcutCard = styled(Card)`
  border-radius: 12px;
  transition: transform 0.2s, box-shadow 0.2s;
  height: 140px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  }
`;

const ShortcutIcon = styled(Box)`
  font-size: 36px;
  margin-bottom: 12px;
  color: ${props => props.theme.palette.primary.main};
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const NewTabContent: React.FC<NewTabContentProps> = ({ tab: _tab }) => {
  const { t } = useTranslation('agent');
  const { addTab, closeTab, activeTabId, tabs } = useTabStore();

  const createAgentChatTab = async (agentDefinitionId?: string) => {
    try {
      const agentDefinitionIdToUse = agentDefinitionId || 'example-agent';

      // Handle current active tab - close temp tabs or NEW_TAB type tabs
      if (activeTabId) {
        const activeTab = tabs.find(tab => tab.id === activeTabId);
        if (activeTab && (activeTab.id.startsWith(TEMP_TAB_ID_PREFIX) || activeTab.type === TabType.NEW_TAB)) {
          closeTab(activeTabId);
        }
      }

      // Create new chat tab directly using addTab
      return await addTab(TabType.CHAT, {
        agentDefId: agentDefinitionIdToUse,
      });
    } catch (error) {
      console.error('Failed to create agent chat tab:', error);
      throw error;
    }
  };

  const createNewAgentTab = async (templateAgentDefinitionId?: string) => {
    try {
      // Handle current active tab - close temp tabs or NEW_TAB type tabs
      if (activeTabId) {
        const activeTab = tabs.find(tab => tab.id === activeTabId);
        if (activeTab && (activeTab.id.startsWith(TEMP_TAB_ID_PREFIX) || activeTab.type === TabType.NEW_TAB)) {
          closeTab(activeTabId);
        }
      }

      // Create new agent definition tab directly using addTab
      return await addTab(TabType.CREATE_NEW_AGENT, {
        title: 'Create New Agent',
        currentStep: 1,
        templateAgentDefId: templateAgentDefinitionId,
      });
    } catch (error) {
      console.error('Failed to create new agent tab:', error);
      throw error;
    }
  };

  return (
    <Container>
      <SearchContainer>
        <Search placeholder={t('NewTab.SearchPlaceholder')} />
      </SearchContainer>

      <Box mb={6}>
        <SectionTitle variant='h5'>
          {t('NewTab.QuickAccess')}
        </SectionTitle>

        <QuickAccessGrid>
          <Grid container spacing={3}>
            <Grid width={{ xs: '50%', sm: '25%', md: '16.66%' }}>
              <ShortcutCard onClick={() => createAgentChatTab()} data-testid={'create-default-agent-button'}>
                <ShortcutIcon>
                  <ChatIcon fontSize='inherit' />
                </ShortcutIcon>
                <Typography variant='subtitle1'>{t('NewTab.CreateDefaultAgent')}</Typography>
              </ShortcutCard>
            </Grid>
            <Grid width={{ xs: '50%', sm: '25%', md: '16.66%' }}>
              <ShortcutCard
                onClick={() => {
                  void createNewAgentTab();
                }}
                data-testid={'create-new-agent-button'}
              >
                <ShortcutIcon>
                  <AddIcon fontSize='inherit' />
                </ShortcutIcon>
                <Typography variant='subtitle1'>{t('NewTab.CreateNewAgent')}</Typography>
              </ShortcutCard>
            </Grid>
          </Grid>
        </QuickAccessGrid>
      </Box>
    </Container>
  );
};
