import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Divider, List, ListItemButton } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';

import { ListItemText } from '@/components/ListItem';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

import translatiumLogo from '@/images/translatium-logo.svg';
import webcatalogLogo from '@/images/webcatalog-logo.svg';

const Logo = styled.img`
  height: 28px;
`;

export function FriendLinks(props: ISectionProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <SectionTitle ref={props.sections.friendLinks.ref}>{t('Preference.FriendLinks')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          <ListItemButton
            onClick={async () => {
              await window.service.native.openURI('https://github.com/webcatalog/webcatalog-engine');
            }}
          >
            <ListItemText secondary={t('Preference.WebCatalogEngineIntro')} />
            <ChevronRightIcon color='action' />
          </ListItemButton>
          <Divider />
          <ListItemButton
            onClick={async () => {
              await window.service.native.openURI('https://webcatalogapp.com?utm_source=tidgi_app');
            }}
          >
            <ListItemText primary={<Logo src={webcatalogLogo} alt={t('Preference.WebCatalog')} />} secondary={t('Preference.WebCatalogIntro')} />
            <ChevronRightIcon color='action' />
          </ListItemButton>
          <Divider />
          <ListItemButton
            onClick={async () => {
              await window.service.native.openURI('https://translatiumapp.com?utm_source=tidgi_app');
            }}
          >
            <ListItemText primary={<Logo src={translatiumLogo} alt={t('Preference.Translatium')} />} secondary={t('Preference.TranslatiumIntro')} />
            <ChevronRightIcon color='action' />
          </ListItemButton>
        </List>
      </Paper>
    </>
  );
}
