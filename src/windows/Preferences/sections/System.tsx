import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { List, ListItemButton, Menu, MenuItem } from '@mui/material';
import PopupState, { bindMenu, bindTrigger } from 'material-ui-popup-state';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import { getOpenAtLoginString, useSystemPreferenceObservable } from '@services/systemPreferences/hooks';
import { Paper, SectionTitle } from '../PreferenceComponents';

export function System(props: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation();

  const systemPreference = useSystemPreferenceObservable();

  return (
    <>
      <SectionTitle ref={props.sectionRef}>{t('Preference.System')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {systemPreference === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
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
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
