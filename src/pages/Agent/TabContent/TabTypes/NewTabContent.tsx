import AddIcon from '@mui/icons-material/Add';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import ChatIcon from '@mui/icons-material/Chat';
import { Box, Card, IconButton, Typography } from '@mui/material';
import { Grid } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Search } from '../../components/Search/Search';
import { TEMP_TAB_ID_PREFIX } from '../../constants/tab';
import { useTabStore } from '../../store/tabStore';
import { INewTab, TabType } from '../../types/tab';

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

const FavoriteGrid = styled(Box)`
  margin-bottom: 24px;
`;

const FavoriteItem = styled(Box)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  transition: background-color 0.2s;
  
  &:hover {
    background-color: ${props => props.theme.palette.action.hover};
  }
`;

const FavoriteIcon = styled(Box)`
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: ${props => props.theme.palette.primary.main};
  color: ${props => props.theme.palette.primary.contrastText};
  display: flex;
  align-items: center;
  justify-content: center;
`;

// Default favorites list
const defaultFavorites = [
  { id: '1', title: 'Google', url: 'https://www.google.com', favicon: 'G' },
  { id: '2', title: 'GitHub', url: 'https://github.com', favicon: 'GH' },
  { id: '3', title: 'YouTube', url: 'https://www.youtube.com', favicon: 'YT' },
  { id: '4', title: 'Wikipedia', url: 'https://www.wikipedia.org', favicon: 'W' },
  { id: '5', title: 'Reddit', url: 'https://www.reddit.com', favicon: 'R' },
  { id: '6', title: 'Twitter', url: 'https://twitter.com', favicon: 'T' },
];

export const NewTabContent: React.FC<NewTabContentProps> = ({ tab }) => {
  const { t } = useTranslation('agent');
  const { transformTabType, addTab, createAgentChatTab } = useTabStore();

  const favorites = tab.favorites && tab.favorites.length > 0
    ? tab.favorites
    : defaultFavorites;
  const handleOpenWebTab = (url: string, title: string) => {
    // Check if current tab is a temporary tab (fallback page)
    if (tab.id.startsWith(TEMP_TAB_ID_PREFIX)) {
      // For temporary tabs, create a new web tab instead of transforming
      void addTab(TabType.WEB, { url, title });
    } else {
      // For real tabs, transform current tab to web tab
      transformTabType(tab.id, TabType.WEB, { url, title });
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
          </Grid>
        </QuickAccessGrid>
      </Box>

      <Box>
        <Box display='flex' justifyContent='space-between' alignItems='center' mb={2}>
          <SectionTitle variant='h5'>
            {t('NewTab.Favorites')}
          </SectionTitle>

          <IconButton color='primary' size='small'>
            <AddIcon />
          </IconButton>
        </Box>

        <FavoriteGrid>
          <Grid container spacing={2}>
            {favorites.map(item => (
              <Grid width={{ xs: '100%', sm: '50%', md: '33.33%' }} key={item.id}>
                <FavoriteItem
                  onClick={() => {
                    handleOpenWebTab(item.url, item.title);
                  }}
                >
                  <FavoriteIcon>
                    {item.favicon || <BookmarkIcon />}
                  </FavoriteIcon>
                  <Box>
                    <Typography variant='body1' fontWeight={500}>
                      {item.title}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {item.url}
                    </Typography>
                  </Box>
                </FavoriteItem>
              </Grid>
            ))}
          </Grid>
        </FavoriteGrid>
      </Box>
    </Container>
  );
};
