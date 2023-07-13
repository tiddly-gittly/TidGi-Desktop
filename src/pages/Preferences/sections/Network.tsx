import { List } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { ListItem } from '@/components/ListItem';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function Network(props: ISectionProps): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sections.network.ref}>{t('Preference.Network')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItem></ListItem>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
