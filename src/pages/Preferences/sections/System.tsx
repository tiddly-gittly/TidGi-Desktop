import React from 'react';
import { useTranslation } from 'react-i18next';
import { List, ListItem, ListItemText, MenuItem } from '@material-ui/core';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import PopUpMenuItem from '@/components/PopUpMenuItem';
import { getOpenAtLoginString, useSystemPreferenceObservable } from '@services/systemPreferences/hooks';
import type { ISectionProps } from '../useSections';
import { Paper, SectionTitle } from '../PreferenceComponents';

export function System(props: ISectionProps): JSX.Element {
  const { t } = useTranslation();

  const systemPreference = useSystemPreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sections.system.ref}>{t('Preference.System')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {systemPreference === undefined ? (
            <ListItem>{t('Loading')}</ListItem>
          ) : (
            <>
              <PopUpMenuItem
                id="openAtLogin"
                buttonElement={
                  <ListItem button>
                    <ListItemText primary={t('Preference.OpenAtLogin')} secondary={getOpenAtLoginString(systemPreference.openAtLogin)} />
                    <ChevronRightIcon color="action" />
                  </ListItem>
                }>
                <MenuItem dense onClick={async () => await window.service.systemPreference.setSystemPreference('openAtLogin', 'yes')}>
                  {t('Yes')}
                </MenuItem>
                <MenuItem dense onClick={async () => await window.service.systemPreference.setSystemPreference('openAtLogin', 'yes-hidden')}>
                  {t('Preference.OpenAtLoginMinimized')}
                </MenuItem>
                <MenuItem dense onClick={async () => await window.service.systemPreference.setSystemPreference('openAtLogin', 'no')}>
                  {t('No')}
                </MenuItem>
              </PopUpMenuItem>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
