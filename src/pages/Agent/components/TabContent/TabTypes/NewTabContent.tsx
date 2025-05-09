import AddIcon from '@mui/icons-material/Add';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import ChatIcon from '@mui/icons-material/Chat';
import CodeIcon from '@mui/icons-material/Code';
import SearchIcon from '@mui/icons-material/Search';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import WebIcon from '@mui/icons-material/Web';
import { Box, Card, Grid, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { useTabStore } from '../../../store/tabStore';
import { INewTab, TabType } from '../../../types/tab';

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

const QuickAccessGrid = styled(Grid)`
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

const FavoriteGrid = styled(Grid)`
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

// 默认收藏夹内容
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
  const { addTab } = useTabStore();

  const favorites = tab.favorites && tab.favorites.length > 0
    ? tab.favorites
    : defaultFavorites;

  const handleOpenWebTab = (url: string, title: string) => {
    addTab(TabType.WEB, { url, title });
  };

  const handleOpenChatTab = () => {
    addTab(TabType.CHAT);
  };

  return (
    <Container>
      <SearchContainer>
        <TextField
          fullWidth
          placeholder={t('agent.newTab.searchPlaceholder')}
          variant='outlined'
          InputProps={{
            startAdornment: (
              <InputAdornment position='start'>
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ borderRadius: 4 }}
        />
      </SearchContainer>

      <Box mb={6}>
        <SectionTitle variant='h5'>
          {t('agent.newTab.quickAccess')}
        </SectionTitle>

        <QuickAccessGrid container spacing={3}>
          <Grid item xs={6} sm={3} md={2}>
            <ShortcutCard onClick={() => addTab(TabType.WEB)}>
              <ShortcutIcon>
                <WebIcon fontSize='inherit' />
              </ShortcutIcon>
              <Typography variant='subtitle1'>{t('agent.newTab.newWebTab')}</Typography>
            </ShortcutCard>
          </Grid>

          <Grid item xs={6} sm={3} md={2}>
            <ShortcutCard onClick={handleOpenChatTab}>
              <ShortcutIcon>
                <ChatIcon fontSize='inherit' />
              </ShortcutIcon>
              <Typography variant='subtitle1'>{t('agent.newTab.newChat')}</Typography>
            </ShortcutCard>
          </Grid>

          <Grid item xs={6} sm={3} md={2}>
            <ShortcutCard>
              <ShortcutIcon>
                <TravelExploreIcon fontSize='inherit' />
              </ShortcutIcon>
              <Typography variant='subtitle1'>{t('agent.newTab.explore')}</Typography>
            </ShortcutCard>
          </Grid>

          <Grid item xs={6} sm={3} md={2}>
            <ShortcutCard>
              <ShortcutIcon>
                <CodeIcon fontSize='inherit' />
              </ShortcutIcon>
              <Typography variant='subtitle1'>{t('agent.newTab.codeTools')}</Typography>
            </ShortcutCard>
          </Grid>
        </QuickAccessGrid>
      </Box>

      <Box>
        <Box display='flex' justifyContent='space-between' alignItems='center' mb={2}>
          <SectionTitle variant='h5'>
            {t('agent.newTab.favorites')}
          </SectionTitle>

          <IconButton color='primary' size='small'>
            <AddIcon />
          </IconButton>
        </Box>

        <FavoriteGrid container spacing={2}>
          {favorites.map(item => (
            <Grid item xs={12} sm={6} md={4} key={item.id}>
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
        </FavoriteGrid>
      </Box>
    </Container>
  );
};
