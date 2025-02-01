import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Divider, List, ListItemButton, Menu, MenuItem, Switch } from '@mui/material';
import PopupState, { bindMenu, bindTrigger } from 'material-ui-popup-state';
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { IPreferences } from '@services/preferences/interface';
import { Paper, SectionTitle } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

const getThemeString = (theme: IPreferences['themeSource']): string => {
  if (theme === 'light') return 'Light';
  if (theme === 'dark') return 'Dark';
  return 'System default';
};

export function General(props: Required<ISectionProps>): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();
  const platform = usePromiseValue(async () => await window.service.context.get('platform'));

  return (
    <>
      <SectionTitle ref={props.sections.general.ref}>{t('Preference.General')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined || platform === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.rememberLastPageVisited}
                    onChange={async (event) => {
                      await window.service.preference.set('rememberLastPageVisited', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.RememberLastVisitState')} />
              </ListItem>
              <Divider />
              <PopupState variant='popover' popupId='theme-popup-menu'>
                {(popupState) => (
                  <>
                    <ListItemButton {...bindTrigger(popupState)}>
                      <ListItemText primary={t('Preference.Theme')} secondary={getThemeString(preference.themeSource)} />
                      <ChevronRightIcon color='action' />
                    </ListItemButton>
                    <Menu {...bindMenu(popupState)}>
                      <MenuItem
                        dense
                        onClick={async () => {
                          await window.service.preference.set('themeSource', 'system');
                          popupState.close();
                        }}
                      >
                        {t('Preference.SystemDefaultTheme')}
                      </MenuItem>
                      <MenuItem
                        dense
                        onClick={async () => {
                          await window.service.preference.set('themeSource', 'light');
                          popupState.close();
                        }}
                      >
                        {t('Preference.LightTheme')}
                      </MenuItem>
                      <MenuItem
                        dense
                        onClick={async () => {
                          await window.service.preference.set('themeSource', 'dark');
                          popupState.close();
                        }}
                      >
                        {t('Preference.DarkTheme')}
                      </MenuItem>
                    </Menu>
                  </>
                )}
              </PopupState>
              <Divider />
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.sidebar}
                    onChange={async (event) => {
                      await window.service.preference.set('sidebar', event.target.checked);
                      await window.service.workspaceView.realignActiveWorkspace();
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.ShowSideBar')} secondary={t('Preference.ShowSideBarDetail')} />
              </ListItem>
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.showSideBarIcon}
                    onChange={async (event) => {
                      await window.service.preference.set('showSideBarIcon', event.target.checked);
                      // when you hide icon, show the text
                      if (!event.target.checked && !preference.showSideBarText) {
                        await window.service.preference.set('showSideBarText', true);
                      }
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.ShowSideBarIcon')} secondary={t('Preference.HideSideBarIconDetail')} />
              </ListItem>
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.showSideBarText}
                    onChange={async (event) => {
                      await window.service.preference.set('showSideBarText', event.target.checked);
                      // when you hide text, show the icon
                      if (!event.target.checked && !preference.showSideBarIcon) {
                        await window.service.preference.set('showSideBarIcon', true);
                      }
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.ShowSideBarText')} />
              </ListItem>
              {platform === 'darwin' && (
                <>
                  <Divider />
                  <ListItem
                    secondaryAction={
                      <Switch
                        edge='end'
                        color='primary'
                        checked={preference.titleBar}
                        onChange={async (event) => {
                          await window.service.preference.set('titleBar', event.target.checked);
                          // no need to realignActiveWorkspace -> realignActiveView , otherwise view will reload bound, and move down by height of titlebar, while titlebar change is not taking effect yet
                          // await window.service.workspaceView.realignActiveWorkspace();
                          props.requestRestartCountDown();
                        }}
                      />
                    }
                  >
                    <ListItemText primary={t('Preference.ShowTitleBar')} secondary={t('Preference.ShowTitleBarDetail')} />
                  </ListItem>
                </>
              )}
              {platform !== 'darwin' && (
                <>
                  <Divider />
                  <ListItem
                    secondaryAction={
                      <Switch
                        edge='end'
                        color='primary'
                        checked={preference.hideMenuBar}
                        onChange={async (event) => {
                          await window.service.preference.set('hideMenuBar', event.target.checked);
                          props.requestRestartCountDown();
                        }}
                      />
                    }
                  >
                    <ListItemText primary={t('Preference.HideMenuBar')} secondary={t('Preference.HideMenuBarDetail')} />
                  </ListItem>
                </>
              )}
              <Divider />
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.alwaysOnTop}
                    onChange={async (event) => {
                      await window.service.preference.set('alwaysOnTop', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.AlwaysOnTop')} secondary={t('Preference.AlwaysOnTopDetail')} />
              </ListItem>
              <Divider />
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.attachToMenubar}
                    onChange={async (event) => {
                      await window.service.preference.set('attachToMenubar', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                }
              >
                <ListItemText
                  primary={platform === 'win32' ? t('Preference.AttachToTaskbar') : t('Preference.AttachToMenuBar')}
                  secondary={platform === 'linux' ? undefined : t('Preference.AttachToMenuBarTip')}
                />
              </ListItem>
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.sidebarOnMenubar}
                    onChange={async (event) => {
                      await window.service.preference.set('sidebarOnMenubar', event.target.checked);
                    }}
                  />
                }
              >
                <ListItemText
                  primary={platform === 'win32' ? t('Preference.AttachToTaskbarShowSidebar') : t('Preference.AttachToMenuBarShowSidebar')}
                  secondary={platform === 'linux' ? undefined : t('Preference.AttachToMenuBarShowSidebarTip')}
                />
              </ListItem>
              <Divider />
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.runOnBackground}
                    onChange={async (event) => {
                      await window.service.preference.set('runOnBackground', event.target.checked);
                    }}
                  />
                }
              >
                <ListItemText
                  primary={t('Preference.RunOnBackground')}
                  secondary={t('Preference.RunOnBackgroundDetail') + (platform === 'darwin' ? '' : t('Preference.RunOnBackgroundDetailNotMac'))}
                />
              </ListItem>
              <ListItem
                secondaryAction={
                  <Switch
                    edge='end'
                    color='primary'
                    checked={preference.menuBarAlwaysOnTop}
                    onChange={async (event) => {
                      await window.service.preference.set('menuBarAlwaysOnTop', event.target.checked);
                      props.requestRestartCountDown();
                    }}
                  />
                }
              >
                <ListItemText primary={t('Preference.MenubarAlwaysOnTop')} secondary={t('Preference.MenubarAlwaysOnTopDetail')} />
              </ListItem>
              {platform === 'darwin' && (
                <>
                  <Divider />
                  <ListItem
                    secondaryAction={
                      <Switch
                        edge='end'
                        color='primary'
                        checked={preference.swipeToNavigate}
                        onChange={async (event) => {
                          await window.service.preference.set('swipeToNavigate', event.target.checked);
                          props.requestRestartCountDown();
                        }}
                      />
                    }
                  >
                    <ListItemText
                      primary={t('Preference.SwipeWithThreeFingersToNavigate')}
                      secondary={
                        <Trans t={t} i18nKey='Preference.SwipeWithThreeFingersToNavigateDescription'>
                          Navigate between pages with 3-finger gestures. Swipe left to go back or swipe right to go forward.
                          <br />
                          To enable it, you also need to change
                          <b>macOS Preferences → TrackPad → More Gestures → Swipe between page</b>
                          to
                          <b>Swipe with three fingers</b>
                          or
                          <b>Swipe with two or three fingers.</b>
                        </Trans>
                      }
                    />
                  </ListItem>
                </>
              )}
            </>
          )}
        </List>
      </Paper>
    </>
  );
}
