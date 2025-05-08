import React, { useState } from 'react';
import styled from 'styled-components';
import { Box, IconButton, TextField, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeIcon from '@mui/icons-material/Home';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import { IWebTab } from '../../../types/tab';
import { useTabStore } from '../../../store/tabStore';

interface WebTabContentProps {
  tab: IWebTab;
}

const Container = styled(Box)`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`;

const AddressBar = styled(Box)`
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
  gap: 8px;
`;

const NavigationButton = styled(IconButton)`
  width: 36px;
  height: 36px;
`;

const AddressInput = styled(TextField)`
  flex: 1;
  .MuiOutlinedInput-root {
    border-radius: 12px;
    background-color: ${props => props.theme.palette.background.default};
  }
`;

const WebContent = styled(Box)`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: ${props => props.theme.palette.background.default};
  overflow: auto;
`;

const UrlDisplay = styled(Box)`
  width: 100%;
  text-align: center;
  word-break: break-all;
  font-family: monospace;
  background-color: ${props => props.theme.palette.background.paper};
  padding: 12px;
  border-radius: 8px;
  border: 1px dashed ${props => props.theme.palette.divider};
`;

export const WebTabContent: React.FC<WebTabContentProps> = ({ tab }) => {
  const { t } = useTranslation('agent');
  const { updateTabData } = useTabStore();
  const [inputUrl, setInputUrl] = useState(tab.url);
  
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputUrl(e.target.value);
  };
  
  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateTabData(tab.id, { url: inputUrl });
  };
  
  const handleRefresh = () => {
    // 模拟刷新行为
    console.log('刷新页面', tab.url);
  };
  
  return (
    <Container>
      <AddressBar>
        <Tooltip title={t('agent.browser.back')}>
          <NavigationButton size="small">
            <ArrowBackIcon />
          </NavigationButton>
        </Tooltip>
        
        <Tooltip title={t('agent.browser.forward')}>
          <NavigationButton size="small">
            <ArrowForwardIcon />
          </NavigationButton>
        </Tooltip>
        
        <Tooltip title={t('agent.browser.refresh')}>
          <NavigationButton size="small" onClick={handleRefresh}>
            <RefreshIcon />
          </NavigationButton>
        </Tooltip>
        
        <Tooltip title={t('agent.browser.home')}>
          <NavigationButton size="small">
            <HomeIcon />
          </NavigationButton>
        </Tooltip>
        
        <form style={{ flex: 1 }} onSubmit={handleUrlSubmit}>
          <AddressInput
            fullWidth
            variant="outlined"
            size="small"
            value={inputUrl}
            onChange={handleUrlChange}
            placeholder={t('agent.browser.enterUrlPlaceholder')}
          />
        </form>
        
        <Tooltip title={t('agent.browser.bookmark')}>
          <NavigationButton size="small">
            <BookmarkIcon />
          </NavigationButton>
        </Tooltip>
      </AddressBar>
      
      <WebContent>
        <UrlDisplay>
          {t('agent.browser.currentUrl')}: {tab.url}
          <br />
          <br />
          {t('agent.browser.renderPlaceholder')}
        </UrlDisplay>
      </WebContent>
    </Container>
  );
};