import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import OpenInBrowserIcon from '@mui/icons-material/OpenInBrowser';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Button, Card, CardActions, CardContent, Chip, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { WindowNames } from '@services/windows/WindowProperties';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type useLoadHelpPagesList } from './useLoadHelpPagesList';

const StyledCard = styled(Card)`
`;

interface HelpWebsiteItemProps {
  item: ReturnType<typeof useLoadHelpPagesList>[number];
}

export const HelpWebsiteItem: React.FC<HelpWebsiteItemProps> = ({ item }) => {
  const { t } = useTranslation();

  const [sourceAnchorElement, setSourceAnchorElement] = useState<null | HTMLElement>(null);
  const handleOpenSourcesMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setSourceAnchorElement(event.currentTarget);
  };

  const [moreAnchorElement, setMoreAnchorElement] = useState<null | HTMLElement>(null);
  const handleOpenMoreMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setMoreAnchorElement(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setSourceAnchorElement(null);
    setMoreAnchorElement(null);
  };

  const openExternalLinkInApp = (uri: string) => {
    void window.service.window.open(WindowNames.any, { uri }, { multiple: true });
  };
  const openExternalLinkInBrowser = (uri: string) => {
    void window.service.native.openURI(uri);
  };

  return (
    <StyledCard>
      <CardContent>
        <Typography variant='h5' component='div'>{item.title}</Typography>
        <Typography variant='body2'>{item.description}</Typography>
        {item.tags.map((tag) => <Chip key={tag} label={t(`Help.Tags.${tag}`)} style={{ marginRight: 10, marginTop: 5 }} />)}
      </CardContent>
      <CardActions>
        <Button
          onClick={() => {
            openExternalLinkInApp(item.url);
          }}
          variant='contained'
          startIcon={<OpenInNewIcon />}
        >
          {t('Open')}
        </Button>
        {item.fallbackUrls.length > 0 && (
          <>
            <Button
              aria-controls='fallback-menu'
              aria-haspopup='true'
              onClick={handleOpenSourcesMenu}
              variant='contained'
              startIcon={<AltRouteIcon />}
            >
              {t('Help.Alternatives')}
            </Button>
            <Menu
              id='fallback-menu'
              anchorEl={sourceAnchorElement}
              keepMounted
              open={Boolean(sourceAnchorElement)}
              onClose={handleCloseMenu}
            >
              {item.fallbackUrls.map((url, index) => (
                <MenuItem
                  key={index}
                  onClick={() => {
                    openExternalLinkInApp(url);
                  }}
                >
                  <ListItemIcon>
                    <OpenInNewIcon />
                  </ListItemIcon>
                  <ListItemText>{new URL(url).hostname}</ListItemText>
                </MenuItem>
              ))}
            </Menu>
          </>
        )}
        <Menu
          id='more-menu'
          anchorEl={moreAnchorElement}
          keepMounted
          open={Boolean(moreAnchorElement)}
          onClose={handleCloseMenu}
        >
          <MenuItem
            onClick={() => {
              openExternalLinkInBrowser(item.url);
            }}
          >
            <ListItemIcon>
              <OpenInBrowserIcon />
            </ListItemIcon>
            <ListItemText>{t('ContextMenu.OpenLinkInBrowser')}</ListItemText>
          </MenuItem>
          {item.contribute && (
            <MenuItem
              onClick={() => {
                openExternalLinkInBrowser(item.contribute);
              }}
            >
              <ListItemIcon>
                <AccessibilityNewIcon />
              </ListItemIcon>
              <ListItemText>{t('Help.Contribute')}</ListItemText>
            </MenuItem>
          )}
        </Menu>
        <Button
          onClick={handleOpenMoreMenu}
          variant='outlined'
        >
          {t('ContextMenu.More')}
        </Button>
      </CardActions>
    </StyledCard>
  );
};
