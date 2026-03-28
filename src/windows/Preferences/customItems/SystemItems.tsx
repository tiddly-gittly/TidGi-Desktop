/**
 * Custom item components extracted from complex Preferences sections.
 * Each component is registered by ID in the customComponentRegistry.
 */
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { ListItemButton, Menu, MenuItem } from '@mui/material';
import PopupState, { bindMenu, bindTrigger } from 'material-ui-popup-state';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import { getOpenAtLoginString, useSystemPreferenceObservable } from '@services/systemPreferences/hooks';

export function OpenAtLoginItem(_props: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const systemPreference = useSystemPreferenceObservable();

  if (systemPreference === undefined) {
    return <ListItem>{t('Loading')}</ListItem>;
  }

  return (
    <PopupState variant='popover' popupId='open-at-login-popup-menu'>
      {(popupState) => (
        <>
          <ListItemButton {...bindTrigger(popupState)}>
            <ListItemText primary={t('Preference.OpenAtLogin')} secondary={getOpenAtLoginString(systemPreference.openAtLogin, t)} />
            <ChevronRightIcon color='action' />
          </ListItemButton>
          <Menu {...bindMenu(popupState)}>
            <MenuItem
              dense
              onClick={async () => {
                await window.service.systemPreference.setSystemPreference('openAtLogin', 'yes');
                popupState.close();
              }}
            >
              {t('Yes')}
            </MenuItem>
            <MenuItem
              dense
              onClick={async () => {
                await window.service.systemPreference.setSystemPreference('openAtLogin', 'yes-hidden');
                popupState.close();
              }}
            >
              {t('Preference.OpenAtLoginMinimized')}
            </MenuItem>
            <MenuItem
              dense
              onClick={async () => {
                await window.service.systemPreference.setSystemPreference('openAtLogin', 'no');
                popupState.close();
              }}
            >
              {t('No')}
            </MenuItem>
          </Menu>
        </>
      )}
    </PopupState>
  );
}
