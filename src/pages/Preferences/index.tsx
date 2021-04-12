import React, { useEffect } from 'react';
import { useDebouncedFn } from 'beautiful-react-hooks';
import styled, { keyframes } from 'styled-components';
import semver from 'semver';
import fromUnixTime from 'date-fns/fromUnixTime';
import setYear from 'date-fns/setYear';
import setMonth from 'date-fns/setMonth';
import setDate from 'date-fns/setDate';
import { Trans, useTranslation } from 'react-i18next';

import {
  Divider,
  Switch,
  List,
  ListItem,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Paper as PaperRaw,
  TextField as TextFieldRaw,
  Typography,
} from '@material-ui/core';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import TimePicker from '@material-ui/lab/TimePicker';

import StatedMenu from '../../components/github/stated-menu';

import { hunspellLanguagesMap } from '../../constants/hunspell-languages';

import webcatalogLogo from '@/images/webcatalog-logo.svg';
import translatiumLogo from '@/images/translatium-logo.svg';

import { TokenForm } from '../../components/TokenForm';
import { IPossibleWindowMeta, WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { IPreferences, PreferenceSections } from '@services/preferences/interface';
import { usePreferenceSections } from './useSections';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { getOpenAtLoginString, useSystemPreferenceObservable } from '@services/systemPreferences/hooks';
import { useUserInfoObservable } from '@services/auth/hooks';
import { getUpdaterDesc, useUpdaterObservable } from '@services/updater/hooks';
import { useThemeObservable } from '@services/theme/hooks';

const Root = styled.div`
  padding: 20px;
  /* background: theme.palette.background.default; */
`;

const animateMoveFromRight = keyframes`
  from {
    transform: translate3d(40px, 0, 0);
    opacity: 0;
  }

  to {
    transform:translate3d(0px, 0, 0);
    opacity: 1;
  }
`;

const SectionTitle = styled(Typography)`
  padding-left: 0px !important;
  animation: ${animateMoveFromRight} 0.5s cubic-bezier(0.4, 0, 0.2, 1);
`;
SectionTitle.defaultProps = {
  variant: 'subtitle2',
};

const animateMoveFromLeft = keyframes`
  from {
    transform: translate3d(-40px, 0, 0);
    opacity: 0;
  }

  to {
    transform: translate3d(0px, 0, 0);
    opacity: 1;
  }
`;

const SideMenuListItem = styled(ListItem)<{ index: number }>`
  animation: ${animateMoveFromLeft} 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  animation-delay: ${({ index }) => index * 0.05}s;
`;

const Paper = styled(PaperRaw)<{ dark?: 0 | 1 }>`
  margin-top: 5px;
  margin-bottom: 30px;
  border: ${({ dark }) => (dark === 1 ? 'none' : '1px solid rgba(0, 0, 0, 0.12)')};
`;

const TimePickerContainer = styled.div`
  margin-top: 10px;
  margin-bottom: 10px;
  display: flex;
  margin-right: 20px;
`;
const SideBar = styled.div`
  position: fixed;
  width: 200px;
  color: #666;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 550px;
  float: right;
`;

const Logo = styled.img`
  height: 28px;
`;

const Link = styled.span`
  cursor: pointer;
  font-weight: 500px;
  outline: none;
  &:hover {
    text-decoration: underline;
  }
  &:focus {
    text-decoration: underline;
  }
`;
Link.defaultProps = {
  role: 'link',
  tabIndex: 0,
};

const TextField = styled(TextFieldRaw)``;
TextField.defaultProps = {
  variant: 'standard',
};
const ListItemVertical = styled(ListItem)`
  flex-direction: column;
  align-items: flex-start;
  padding-bottom: 10px;

  & ${TextField} {
    margin-top: 20px;
  }
` as typeof ListItem;

const getThemeString = (theme: IPreferences['themeSource']): string => {
  if (theme === 'light') return 'Light';
  if (theme === 'dark') return 'Dark';
  return 'System default';
};

export default function Preferences(): JSX.Element {
  const { t } = useTranslation();
  const sections = usePreferenceSections();

  useEffect(() => {
    const scrollTo = (window.meta as IPossibleWindowMeta<WindowMeta[WindowNames.preferences]>).gotoTab;
    if (scrollTo === undefined) return;
    sections[scrollTo].ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [sections]);

  const debouncedRequestShowRequireRestartDialog = useDebouncedFn(async () => await window.service.window.requestShowRequireRestartDialog(), 2500);

  const platform = usePromiseValue(async () => (await window.service.context.get('platform')) as string);
  const oSVersion = usePromiseValue(async () => (await window.service.context.get('oSVersion')) as string);
  const LOG_FOLDER = usePromiseValue(async () => (await window.service.context.get('LOG_FOLDER')) as string);

  const preference = usePreferenceObservable();
  const systemPreference = useSystemPreferenceObservable();
  const userInfo = useUserInfoObservable();
  const updaterMetaData = useUpdaterObservable();
  const theme = useThemeObservable();
  if (preference === undefined || systemPreference === undefined || userInfo === undefined || updaterMetaData === undefined || theme === undefined) {
    return <Root>Loading...</Root>;
  }

  const {
    allowPrerelease,
    askForDownloadPath,
    attachToMenubar,
    downloadPath,
    hibernateUnusedWorkspacesAtLaunch,
    hideMenuBar,
    ignoreCertificateErrors,
    pauseNotificationsBySchedule,
    pauseNotificationsByScheduleFrom,
    pauseNotificationsByScheduleTo,
    pauseNotificationsMuteAudio,
    rememberLastPageVisited,
    shareWorkspaceBrowsingData,
    sidebar,
    sidebarShortcutHints,
    spellcheck,
    spellcheckLanguages,
    swipeToNavigate,
    syncDebounceInterval,
    themeSource,
    titleBar,
    unreadCountBadge,
    useHardwareAcceleration,
  } = preference;
  const { openAtLogin } = systemPreference;

  Paper.defaultProps = { dark: theme.shouldUseDarkColors ? 1 : 0 };

  return (
    <Root>
      <SideBar>
        <List dense>
          {Object.keys(sections).map((sectionKey, index) => {
            const { Icon, text, ref, hidden } = sections[sectionKey as PreferenceSections];
            if (hidden === true) return <></>;
            return (
              <React.Fragment key={sectionKey}>
                {index > 0 && <Divider />}
                <SideMenuListItem button index={index} onClick={() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <ListItemIcon>
                    <Icon />
                  </ListItemIcon>
                  <ListItemText primary={text} />
                </SideMenuListItem>
              </React.Fragment>
            );
          })}
        </List>
      </SideBar>

      <Inner>
        <SectionTitle ref={sections.wiki.ref}>{t('Preference.TiddlyWiki')}</SectionTitle>
        <Paper elevation={0}>
          <List dense disablePadding>
            <ListItemVertical>
              <ListItemText primary={t('Preference.WikiMetaData')} secondary={t('Preference.WikiMetaDataDescription')} />
              <TextField
                helperText={t('Preference.UserNameDetail')}
                fullWidth
                onChange={async (event) => {
                  await window.service.auth.set('userName', event.target.value);
                }}
                label={t('Preference.UserName')}
                value={userInfo?.userName}
              />
            </ListItemVertical>
          </List>
        </Paper>

        <SectionTitle ref={sections.sync.ref}>{t('Preference.Sync')}</SectionTitle>
        <Paper elevation={0}>
          <List dense disablePadding>
            <ListItem>
              <TokenForm />
            </ListItem>
            <ListItem>
              <ListItemText primary={t('Preference.SyncInterval')} secondary={t('Preference.SyncIntervalDescription')} />
              <TimePickerContainer>
                <TimePicker
                  ampm={false}
                  openTo="hours"
                  views={['hours', 'minutes', 'seconds']}
                  inputFormat="HH:mm:ss"
                  mask="__:__:__"
                  renderInput={(timeProps) => <TextField {...timeProps} />}
                  value={fromUnixTime(syncDebounceInterval / 1000 + new Date().getTimezoneOffset() * 60)}
                  onChange={async (date) => {
                    if (date === null) throw new Error(`date is null`);
                    const timeWithoutDate = setDate(setMonth(setYear(date, 1970), 0), 1);
                    const utcTime = (timeWithoutDate.getTime() / 1000 - new Date().getTimezoneOffset() * 60) * 1000;
                    await window.service.preference.set('syncDebounceInterval', utcTime);
                    await debouncedRequestShowRequireRestartDialog();
                  }}
                  onClose={async () => await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: false })}
                  onOpen={async () => await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: true })}
                />
              </TimePickerContainer>
            </ListItem>
          </List>
        </Paper>

        <SectionTitle ref={sections.general.ref}>{t('Preference.General')}</SectionTitle>
        <Paper elevation={0}>
          <List dense disablePadding>
            <ListItem>
              <ListItemText primary={t('Preference.RememberLastVisitState')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={rememberLastPageVisited}
                  onChange={async (event) => {
                    await window.service.preference.set('rememberLastPageVisited', event.target.checked);
                    await debouncedRequestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <StatedMenu
              id="theme"
              buttonElement={
                <ListItem button>
                  <ListItemText primary={t('Preference.Theme')} secondary={getThemeString(themeSource)} />
                  <ChevronRightIcon color="action" />
                </ListItem>
              }>
              <MenuItem dense onClick={async () => await window.service.preference.set('themeSource', 'system')}>
                {t('Preference.SystemDefalutTheme')}
              </MenuItem>
              <MenuItem dense onClick={async () => await window.service.preference.set('themeSource', 'light')}>
                {t('Preference.LightTheme')}
              </MenuItem>
              <MenuItem dense onClick={async () => await window.service.preference.set('themeSource', 'dark')}>
                {t('Preference.DarkTheme')}
              </MenuItem>
            </StatedMenu>
            <Divider />
            <ListItem>
              <ListItemText primary={t('Preference.ShowSideBar')} secondary={t('Preference.ShowSideBarDetail')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={sidebar}
                  onChange={async (event) => {
                    await window.service.preference.set('sidebar', event.target.checked);
                    await window.service.workspaceView.realignActiveWorkspace();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText primary={t('Preference.ShowSideBarShortcut')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={sidebarShortcutHints}
                  onChange={async (event) => {
                    await window.service.preference.set('sidebarShortcutHints', event.target.checked);
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {platform === 'darwin' && (
              <>
                <Divider />
                <ListItem>
                  <ListItemText primary={t('Preference.ShowTitleBar')} secondary={t('Preference.ShowTitleBarDetail')} />
                  <ListItemSecondaryAction>
                    <Switch
                      edge="end"
                      color="primary"
                      checked={titleBar}
                      onChange={async (event) => {
                        await window.service.preference.set('titleBar', event.target.checked);
                        await window.service.workspaceView.realignActiveWorkspace();
                        await debouncedRequestShowRequireRestartDialog();
                      }}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </>
            )}
            {platform !== 'darwin' && (
              <>
                <Divider />
                <ListItem>
                  <ListItemText primary={t('Preference.HideMenuBar')} secondary={t('Preference.HideMenuBarDetail')} />
                  <ListItemSecondaryAction>
                    <Switch
                      edge="end"
                      color="primary"
                      checked={hideMenuBar}
                      onChange={async (event) => {
                        await window.service.preference.set('hideMenuBar', event.target.checked);
                        await debouncedRequestShowRequireRestartDialog();
                      }}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </>
            )}
            <Divider />
            <ListItem>
              <ListItemText
                primary={platform === 'win32' ? t('Preference.AttachToTaskbar') : t('Preference.AttachToMenuBar')}
                secondary={platform !== 'linux' ? t('Preference.AttachToMenuBarTip') : undefined}
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={attachToMenubar}
                  onChange={async (event) => {
                    await window.service.preference.set('attachToMenubar', event.target.checked);
                    await debouncedRequestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {platform === 'darwin' && (
              <>
                <Divider />
                <ListItem>
                  <ListItemText
                    primary={t('Preference.SwipeWithThreeFingersToNavigate')}
                    secondary={
                      <Trans t={t} i18nKey="Preference.SwipeWithThreeFingersToNavigateDescription">
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
                  <ListItemSecondaryAction>
                    <Switch
                      edge="end"
                      color="primary"
                      checked={swipeToNavigate}
                      onChange={async (event) => {
                        await window.service.preference.set('swipeToNavigate', event.target.checked);
                        await debouncedRequestShowRequireRestartDialog();
                      }}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </>
            )}
          </List>
        </Paper>

        <SectionTitle ref={sections.notifications.ref}>{t('Preference.Notifications')}</SectionTitle>
        <Paper elevation={0}>
          <List dense disablePadding>
            <ListItem button onClick={async () => await window.service.window.open(WindowNames.notifications)}>
              <ListItemText primary={t('Preference.NotificationsDetail')} />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItemVertical>
              <ListItemText primary={t('Preference.NotificationsDisableSchedule')} />
              <TimePickerContainer>
                <TimePicker
                  label="from"
                  renderInput={(timeProps) => <TextField {...timeProps} />}
                  value={new Date(pauseNotificationsByScheduleFrom)}
                  onChange={async (d) => await window.service.preference.set('pauseNotificationsByScheduleFrom', (d ?? '').toString())}
                  onClose={async () => await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: false })}
                  onOpen={async () => await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: true })}
                  disabled={!pauseNotificationsBySchedule}
                />
                <TimePicker
                  label="to"
                  renderInput={(timeProps) => <TextField {...timeProps} />}
                  value={new Date(pauseNotificationsByScheduleTo)}
                  onChange={async (d) => await window.service.preference.set('pauseNotificationsByScheduleTo', (d ?? '').toString())}
                  onClose={async () => await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: false })}
                  onOpen={async () => await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: true })}
                  disabled={!pauseNotificationsBySchedule}
                />
              </TimePickerContainer>
              ({window.Intl.DateTimeFormat().resolvedOptions().timeZone})
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={pauseNotificationsBySchedule}
                  onChange={async (event) => {
                    await window.service.preference.set('pauseNotificationsBySchedule', event.target.checked);
                  }}
                />
              </ListItemSecondaryAction>
            </ListItemVertical>
            <Divider />
            <ListItem>
              <ListItemText primary={t('Preference.NotificationsMuteAudio')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={pauseNotificationsMuteAudio}
                  onChange={async (event) => {
                    await window.service.preference.set('pauseNotificationsMuteAudio', event.target.checked);
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText primary="Show unread count badge" />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={unreadCountBadge}
                  onChange={async (event) => {
                    await window.service.preference.set('unreadCountBadge', event.target.checked);
                    await debouncedRequestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem
              button
              onClick={() => {
                void window.service.notification.show({
                  title: t('Preference.TestNotification'),
                  body: t('Preference.ItIsWorking'),
                });
              }}>
              <ListItemText
                primary={t('Preference.TestNotification')}
                secondary={(() => {
                  // only show this message on macOS Catalina 10.15 & above
                  if (platform === 'darwin' && oSVersion !== undefined && semver.gte(oSVersion, '10.15.0')) {
                    return (
                      <Trans t={t} i18nKey="Preference.TestNotificationDescription">
                        <span>
                          If notifications dont show up, make sure you enable notifications in
                          <b>macOS Preferences → Notifications → TiddlyGit</b>.
                        </span>
                      </Trans>
                    );
                  }
                })()}
              />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText
                secondary={
                  <Trans t={t} i18nKey="Preference.HowToEnableNotifications">
                    <span>
                      TiddlyGit supports notifications out of the box. But for some cases, to receive notifications, you will need to manually configure
                      additional web app settings.
                    </span>
                    <Link
                      onClick={async () =>
                        await window.service.native.open('https://github.com/atomery/webcatalog/wiki/How-to-Enable-Notifications-in-Web-Apps')
                      }
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        void window.service.native.open('https://github.com/atomery/webcatalog/wiki/How-to-Enable-Notifications-in-Web-Apps');
                      }}>
                      Learn more
                    </Link>
                    <span>.</span>
                  </Trans>
                }
              />
            </ListItem>
          </List>
        </Paper>

        <SectionTitle ref={sections.languages.ref}>{t('Preference.Languages')}</SectionTitle>
        <Paper elevation={0}>
          <List dense disablePadding>
            <ListItem>
              <ListItemText primary={t('Preference.SpellCheck')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={spellcheck}
                  onChange={async (event) => {
                    await window.service.preference.set('spellcheck', event.target.checked);
                    await debouncedRequestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {platform !== 'darwin' && (
              <>
                <Divider />
                <ListItem button onClick={async () => await window.service.window.open(WindowNames.spellcheck)}>
                  <ListItemText
                    primary={t('Preference.SpellCheckLanguages')}
                    secondary={spellcheckLanguages.map((code) => hunspellLanguagesMap[code]).join(' | ')}
                  />
                  <ChevronRightIcon color="action" />
                </ListItem>
              </>
            )}
          </List>
        </Paper>

        <SectionTitle ref={sections.downloads.ref}>{t('Preference.Downloads')}</SectionTitle>
        <Paper elevation={0}>
          <List dense disablePadding>
            <ListItem
              button
              onClick={() => {
                window.service.native
                  .pickDirectory()
                  .then(async (filePaths) => {
                    if (filePaths.length > 0) {
                      await window.service.preference.set('downloadPath', filePaths[0]);
                    }
                  })
                  .catch((error: any) => {
                    console.log(error); // eslint-disable-line no-console
                  });
              }}>
              <ListItemText primary={t('Preference.DownloadLocation')} secondary={downloadPath} />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText primary={t('Preference.AskDownloadLocation')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={askForDownloadPath}
                  onChange={async (event) => {
                    await window.service.preference.set('askForDownloadPath', event.target.checked);
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </Paper>

        <SectionTitle color="textPrimary" ref={sections.network.ref}>
          {t('Preference.Network')}
        </SectionTitle>

        <SectionTitle ref={sections.privacy.ref}>{t('Preference.PrivacyAndSecurity')}</SectionTitle>
        <Paper elevation={0}>
          <List dense disablePadding>
            <ListItem>
              <ListItemText primary={t('Preference.ShareBrowsingData')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={shareWorkspaceBrowsingData}
                  onChange={async (event) => {
                    await window.service.preference.set('shareWorkspaceBrowsingData', event.target.checked);
                    await debouncedRequestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText
                primary={t('Preference.IgnoreCertificateErrors')}
                secondary={
                  <Trans t={t} i18nKey="Preference.IgnoreCertificateErrorsDescription">
                    <span>Not recommended. </span>
                    <Link
                      onClick={async () =>
                        await window.service.native.open('https://groups.google.com/a/chromium.org/d/msg/security-dev/mB2KJv_mMzM/ddMteO9RjXEJ')
                      }
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        void window.service.native.open('https://groups.google.com/a/chromium.org/d/msg/security-dev/mB2KJv_mMzM/ddMteO9RjXEJ');
                      }}>
                      Learn more
                    </Link>
                    .
                  </Trans>
                }
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={ignoreCertificateErrors}
                  onChange={async (event) => {
                    await window.service.preference.set('ignoreCertificateErrors', event.target.checked);
                    await debouncedRequestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem button onClick={window.service.workspaceView.clearBrowsingDataWithConfirm}>
              <ListItemText primary={t('Preference.ClearBrowsingData')} secondary={t('Preference.ClearBrowsingDataDescription')} />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem
              button
              onClick={async () => await window.service.native.open('https://github.com/tiddly-gittly/TiddlyGit-Desktop/blob/master/PrivacyPolicy.md')}>
              <ListItemText primary="Privacy Policy" />
            </ListItem>
          </List>
        </Paper>

        <SectionTitle ref={sections.system.ref}>{t('Preference.System')}</SectionTitle>
        <Paper elevation={0}>
          <List dense disablePadding>
            <StatedMenu
              id="openAtLogin"
              buttonElement={
                <ListItem button>
                  <ListItemText primary={t('Preference.OpenAtLogin')} secondary={getOpenAtLoginString(openAtLogin)} />
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
            </StatedMenu>
          </List>
        </Paper>

        <SectionTitle ref={sections.developers.ref}>{t('Preference.DeveloperTools')}</SectionTitle>
        <Paper elevation={0}>
          <List dense disablePadding>
            <ListItem
              button
              onClick={() => {
                if (LOG_FOLDER !== undefined) {
                  void window.service.native.open(LOG_FOLDER, true);
                }
              }}>
              <ListItemText primary={t('Preference.OpenLogFolder')} secondary={t('Preference.OpenLogFolderDetail')} />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem button onClick={window.service.preference.resetWithConfirm}>
              <ListItemText primary={t('Preference.RestorePreferences')} />
              <ChevronRightIcon color="action" />
            </ListItem>
          </List>
        </Paper>

        <SectionTitle ref={sections.performance.ref}>{t('Preference.Performance')}</SectionTitle>
        <Paper elevation={0}>
          <List dense disablePadding>
            <ListItem>
              <ListItemText primary={t('Preference.HibernateAllUnusedWorkspaces')} secondary={t('Preference.HibernateAllUnusedWorkspacesDescription')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={hibernateUnusedWorkspacesAtLaunch}
                  onChange={async (event) => {
                    await window.service.preference.set('hibernateUnusedWorkspacesAtLaunch', event.target.checked);
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>

            <Divider />
            <ListItem>
              <ListItemText primary={t('Preference.hardwareAcceleration')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={useHardwareAcceleration}
                  onChange={async (event) => {
                    await window.service.preference.set('useHardwareAcceleration', event.target.checked);
                    await debouncedRequestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </Paper>

        <SectionTitle ref={sections.updates.ref}>{t('Preference.Updates')}</SectionTitle>
        <Paper elevation={0}>
          <List dense disablePadding>
            <ListItem
              button
              onClick={async () => await window.service.updater.checkForUpdates(false)}
              disabled={
                updaterMetaData.status === 'checking-for-update' ||
                updaterMetaData.status === 'download-progress' ||
                updaterMetaData.status === 'update-available'
              }>
              <ListItemText
                primary={updaterMetaData.status === 'update-downloaded' ? t('Preference.RestartToApplyUpdates') : t('ContextMenu.CheckForUpdates')}
                secondary={getUpdaterDesc(updaterMetaData.status, updaterMetaData.info)}
              />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText primary={t('Preference.ReceivePreReleaseUpdates')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={allowPrerelease}
                  onChange={async (event) => {
                    await window.service.preference.set('allowPrerelease', event.target.checked);
                    await debouncedRequestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </Paper>

        <SectionTitle color="textPrimary" ref={sections.friendLinks.ref}>
          {t('Preference.FriendLinks')}
        </SectionTitle>
        <Paper elevation={0}>
          <List disablePadding dense>
            <ListItem button onClick={async () => await window.service.native.open('https://github.com/webcatalog/webcatalog-engine')}>
              <ListItemText secondary={t('Preference.WebCatalogEngineIntro')} />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem button onClick={async () => await window.service.native.open('https://webcatalogapp.com?utm_source=tiddlygit_app')}>
              <ListItemText primary={<Logo src={webcatalogLogo} alt={t('Preference.WebCatalog')} />} secondary={t('Preference.WebCatalogIntro')} />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem button onClick={async () => await window.service.native.open('https://translatiumapp.com?utm_source=tiddlygit_app')}>
              <ListItemText primary={<Logo src={translatiumLogo} alt={t('Preference.Translatium')} />} secondary={t('Preference.TranslatiumIntro')} />
              <ChevronRightIcon color="action" />
            </ListItem>
          </List>
        </Paper>

        <SectionTitle ref={sections.misc.ref}>{t('Preference.Miscellaneous')}</SectionTitle>
        <Paper elevation={0}>
          <List dense disablePadding>
            <ListItem button onClick={async () => await window.service.window.open(WindowNames.about)}>
              <ListItemText primary={t('ContextMenu.About')} />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem button onClick={async () => await window.service.native.open('https://github.com/tiddly-gittly/tiddlygit-desktop/')}>
              <ListItemText primary={t('Preference.WebSite')} />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem button onClick={async () => await window.service.native.open('https://github.com/tiddly-gittly/tiddlygit-desktop/issues')}>
              <ListItemText primary={t('Preference.Support')} />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem button onClick={window.service.native.quit}>
              <ListItemText primary={t('ContextMenu.Quit')} />
              <ChevronRightIcon color="action" />
            </ListItem>
          </List>
        </Paper>
      </Inner>
    </Root>
  );
}
