import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import HomeIcon from '@mui/icons-material/Home';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Box, IconButton, TextField, Tooltip } from '@mui/material';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useTabStore } from '../../../store/tabStore';
import { IWebTab } from '../../../types/tab';

/** Props for the web tab content component */
interface WebTabContentProps {
  /** Web tab data */
  tab: IWebTab;
}

/** Container component */
const Container = styled(Box)`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`;

/** Address bar container */
const AddressBar = styled(Box)`
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
  gap: 8px;
`;

/** Navigation button styles */
const NavigationButton = styled(IconButton)`
  width: 36px;
  height: 36px;
`;

/** Address input field */
const AddressInput = styled(TextField)`
  flex: 1;
  .MuiOutlinedInput-root {
    border-radius: 12px;
    background-color: ${props => props.theme.palette.background.default};
  }
`;

/** Web content area */
const WebContent = styled(Box)`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: ${props => props.theme.palette.background.default};
  overflow: auto;
`;

/** URL display box */
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

/**
 * Web Tab Content Component
 * Displays a browser-like interface with navigation controls
 */
export const WebTabContent: React.FC<WebTabContentProps> = ({ tab }) => {
  const { t } = useTranslation('agent');
  const { updateTabData } = useTabStore();
  const [inputUrl, setInputUrl] = useState(tab.url);

  /** Handle address bar input changes */
  const handleUrlChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setInputUrl(event.target.value);
  }, []);

  /** Handle address bar form submission */
  const handleUrlSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    updateTabData(tab.id, { url: inputUrl });
  }, [tab.id, inputUrl, updateTabData]);

  /** Handle page refresh */
  const handleRefresh = useCallback(() => {
    updateTabData(tab.id, { url: tab.url });
  }, [tab.id, tab.url, updateTabData]);

  /** Navigate to home page */
  const handleHome = useCallback(() => {
    const homeUrl = 'about:home';
    setInputUrl(homeUrl);
    updateTabData(tab.id, { url: homeUrl });
  }, [tab.id, updateTabData]);

  return (
    <Container>
      <AddressBar>
        <Tooltip title={t('Browser.Back')}>
          <span>
            <NavigationButton size='small' disabled>
              <ArrowBackIcon />
            </NavigationButton>
          </span>
        </Tooltip>

        <Tooltip title={t('Browser.Forward')}>
          <span>
            <NavigationButton size='small' disabled>
              <ArrowForwardIcon />
            </NavigationButton>
          </span>
        </Tooltip>

        <Tooltip title={t('Browser.Refresh')}>
          <NavigationButton size='small' onClick={handleRefresh}>
            <RefreshIcon />
          </NavigationButton>
        </Tooltip>

        <Tooltip title={t('Browser.Home')}>
          <NavigationButton size='small' onClick={handleHome}>
            <HomeIcon />
          </NavigationButton>
        </Tooltip>

        <form style={{ flex: 1 }} onSubmit={handleUrlSubmit}>
          <AddressInput
            fullWidth
            variant='outlined'
            size='small'
            value={inputUrl}
            onChange={handleUrlChange}
            placeholder={t('Browser.EnterUrlPlaceholder')}
          />
        </form>

        <Tooltip title={t('Browser.Bookmark')}>
          <span>
            <NavigationButton size='small' disabled>
              <BookmarkIcon />
            </NavigationButton>
          </span>
        </Tooltip>
      </AddressBar>

      <WebContent>
        <UrlDisplay>
          {t('Browser.CurrentUrl')}: {tab.url}
          <br />
          <br />
          {t('Browser.RenderPlaceholder')}
        </UrlDisplay>
      </WebContent>
    </Container>
  );
};
