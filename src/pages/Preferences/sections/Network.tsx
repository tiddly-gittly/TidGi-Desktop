import { useTranslation } from 'react-i18next';
import { List } from '@material-ui/core';

import type { ISectionProps } from '../useSections';
import { Paper, SectionTitle, ListItem } from '../PreferenceComponents';
import { usePreferenceObservable } from '@services/preferences/hooks';

export function Network(props: ISectionProps): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sections.network.ref}>{t('Preference.Network')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? (
            <ListItem>{t('Loading')}</ListItem>
          ) : (
            <>
              <ListItem></ListItem>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
