import { List } from '@material-ui/core';
import { useTranslation } from 'react-i18next';

import { usePreferenceObservable } from '@services/preferences/hooks';
import { ListItem, Paper, SectionTitle } from '../PreferenceComponents';
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
