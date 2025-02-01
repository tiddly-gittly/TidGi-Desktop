import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Divider, List, ListItemButton } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { ListItemText } from '@/components/ListItem';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

import { WindowNames } from '@services/windows/WindowProperties';

export function Miscellaneous(props: ISectionProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <SectionTitle ref={props.sections.misc.ref}>{t('Preference.Miscellaneous')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          <ListItemButton
            onClick={async () => {
              await window.service.window.open(WindowNames.about);
            }}
          >
            <ListItemText primary={t('ContextMenu.About')} />
            <ChevronRightIcon color='action' />
          </ListItemButton>
          <Divider />
          <ListItemButton
            onClick={async () => {
              await window.service.native.openURI('https://github.com/tiddly-gittly/TidGi-desktop/');
            }}
          >
            <ListItemText primary={t('Preference.WebSite')} />
            <ChevronRightIcon color='action' />
          </ListItemButton>
          <Divider />
          <ListItemButton
            onClick={async () => {
              await window.service.native.openURI('https://github.com/tiddly-gittly/TidGi-desktop/issues');
            }}
          >
            <ListItemText primary={t('Preference.Support')} />
            <ChevronRightIcon color='action' />
          </ListItemButton>
          <Divider />
          <ListItemButton
            onClick={() => {
              window.service.native.quit();
            }}
          >
            <ListItemText primary={t('ContextMenu.Quit')} />
            <ChevronRightIcon color='action' />
          </ListItemButton>
        </List>
      </Paper>
    </>
  );
}
