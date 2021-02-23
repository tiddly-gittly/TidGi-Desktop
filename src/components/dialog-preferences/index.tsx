/* eslint-disable consistent-return */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import semver from 'semver';
import fromUnixTime from 'date-fns/fromUnixTime';
import setYear from 'date-fns/setYear';
import setMonth from 'date-fns/setMonth';
import setDate from 'date-fns/setDate';
import { debounce } from 'lodash';
import { useTranslation } from 'react-i18next';

import Divider from '@material-ui/core/Divider';
import Grid from '@material-ui/core/Grid';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import ListItemText from '@material-ui/core/ListItemText';
import MenuItem from '@material-ui/core/MenuItem';
import Paper from '@material-ui/core/Paper';
import Slider from '@material-ui/core/Slider';
import Switch from '@material-ui/core/Switch';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';

import BuildIcon from '@material-ui/icons/Build';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import CodeIcon from '@material-ui/icons/Code';
import ExtensionIcon from '@material-ui/icons/Extension';
import LanguageIcon from '@material-ui/icons/Language';
import MoreHorizIcon from '@material-ui/icons/MoreHoriz';
import NotificationsIcon from '@material-ui/icons/Notifications';
import PowerIcon from '@material-ui/icons/Power';
import RotateLeftIcon from '@material-ui/icons/RotateLeft';
import RouterIcon from '@material-ui/icons/Router';
import SecurityIcon from '@material-ui/icons/Security';
import StorefrontIcon from '@material-ui/icons/Storefront';
import SystemUpdateAltIcon from '@material-ui/icons/SystemUpdateAlt';
import WidgetsIcon from '@material-ui/icons/Widgets';
import GitHubIcon from '@material-ui/icons/GitHub';
import MenuBookIcon from '@material-ui/icons/MenuBook';

import { TimePicker } from '@material-ui/pickers';

import { getGithubUserInfo, setGithubUserInfo } from '@services/types';

import StatedMenu from '../github/stated-menu';

import hunspellLanguagesMap from '../../constants/hunspell-languages';

import webcatalogLogo from '../../images/webcatalog-logo.svg';
import translatiumLogo from '../../images/translatium-logo.svg';

import ListItemDefaultMailClient from './list-item-default-mail-client';
import ListItemDefaultBrowser from './list-item-default-browser';
import { GithubTokenForm, getGithubToken, setGithubToken } from '../github/git-token-form';
import type { IAuthingUserInfo } from '@services/types';
import { WindowNames } from '@services/windows/WindowProperties';

const styles = (theme: any) => ({
  root: {
    padding: theme.spacing(2),
    background: theme.palette.background.default,
  },

  sectionTitle: {
    paddingLeft: theme.spacing(2),
  },

  paper: {
    marginTop: theme.spacing(0.5),
    marginBottom: theme.spacing(3),
    border: theme.palette.type === 'dark' ? 'none' : '1px solid rgba(0, 0, 0, 0.12)',
  },

  tokenContainer: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
    display: 'flex',
    justifyContent: 'space-around',
    flexDirection: 'column',
    width: 200,
    minWidth: 200,
  },

  timePickerContainer: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
    display: 'flex',
    justifyContent: 'space-around',
    width: 200,
    minWidth: 200,
  },

  secondaryEllipsis: {
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },

  sidebar: {
    position: 'fixed',
    width: 200,
    color: theme.palette.text.primary,
  },

  inner: {
    width: '100%',
    maxWidth: 550,
    float: 'right',
  },

  logo: {
    height: 28,
  },

  link: {
    cursor: 'pointer',
    fontWeight: 500,
    outline: 'none',
    '&:hover': {
      textDecoration: 'underline',
    },
    '&:focus': {
      textDecoration: 'underline',
    },
  },

  sliderContainer: {
    paddingLeft: theme.spacing(5),
    paddingRight: theme.spacing(5),
  },

  sliderTitleContainer: {
    paddingTop: `${theme.spacing(1.5)}px !important`,
    width: 100,
  },

  sliderMarkLabel: {
    fontSize: '0.75rem',
  },
});

const getThemeString = (theme: any) => {
  if (theme === 'light') return 'Light';
  if (theme === 'dark') return 'Dark';
  return 'System default';
};

const getOpenAtLoginString = (openAtLogin: any) => {
  // eslint-disable-next-line sonarjs/no-duplicate-string
  if (openAtLogin === 'yes-hidden') return 'Yes, but minimized';
  if (openAtLogin === 'yes') return 'Yes';
  return 'No';
};

const formatBytes = (bytes: any, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const index = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** index).toFixed(dm))} ${sizes[index]}`;
};

const getUpdaterDesc = (status: any, info: any) => {
  // eslint-disable-next-line sonarjs/no-duplicate-string
  if (status === 'download-progress') {
    if (info !== null) {
      const { transferred, total, bytesPerSecond } = info;
      return `Downloading updates (${formatBytes(transferred)}/${formatBytes(total)} at ${formatBytes(bytesPerSecond)}/s)...`;
    }
    return 'Downloading updates...';
  }
  if (status === 'checking-for-update') {
    return 'Checking for updates...';
  }
  if (status === 'update-available') {
    return 'Downloading updates...';
  }
  if (status === 'update-downloaded') {
    if (info && info.version) return `A new version (${info.version}) has been downloaded.`;
    return 'A new version has been downloaded.';
  }
};

interface PreferencesProps {
  allowPrerelease: boolean;
  askForDownloadPath: boolean;
  attachToMenubar: boolean;
  blockAds: boolean;
  classes: any;
  darkReader: boolean;
  darkReaderBrightness: number;
  darkReaderContrast: number;
  darkReaderGrayscale: number;
  darkReaderSepia: number;
  downloadPath: string;
  hibernateUnusedWorkspacesAtLaunch: boolean;
  hideMenuBar: boolean;
  ignoreCertificateErrors: boolean;
  navigationBar: boolean;
  openAtLogin: 'yes' | 'yes-hidden' | 'no';
  pauseNotificationsBySchedule: boolean;
  pauseNotificationsByScheduleFrom: string;
  pauseNotificationsByScheduleTo: string;
  pauseNotificationsMuteAudio: boolean;
  rememberLastPageVisited: boolean;
  shareWorkspaceBrowsingData: boolean;
  sidebar: boolean;
  sidebarShortcutHints: boolean;
  spellcheck: boolean;
  spellcheckLanguages: string[];
  swipeToNavigate: boolean;
  syncDebounceInterval: number;
  themeSource: string;
  titleBar: boolean;
  unreadCountBadge: boolean;
  updaterInfo?: any;
  updaterStatus?: string;
  userName?: string;
  useHardwareAcceleration: boolean;
}

export default function Preferences(): JSX.Element {
  const { t } = useTranslation();

  const sections = {
    wiki: {
      text: 'Wiki',
      Icon: MenuBookIcon,
      ref: useRef(),
    },
    sync: {
      text: t('Preference.Sync'),
      Icon: GitHubIcon,
      ref: useRef(),
    },
    general: {
      text: t('Preference.General'),
      Icon: WidgetsIcon,
      ref: useRef(),
    },
    extensions: {
      text: 'Extensions',
      Icon: ExtensionIcon,
      ref: useRef(),
    },
    notifications: {
      text: 'Notifications',
      Icon: NotificationsIcon,
      ref: useRef(),
    },
    languages: {
      text: 'Languages',
      Icon: LanguageIcon,
      ref: useRef(),
    },
    downloads: {
      text: 'Downloads',
      Icon: CloudDownloadIcon,
      ref: useRef(),
    },
    network: {
      text: 'Network',
      Icon: RouterIcon,
      ref: useRef(),
    },
    privacy: {
      text: 'Privacy & Security',
      Icon: SecurityIcon,
      ref: useRef(),
    },
    system: {
      text: 'System',
      Icon: BuildIcon,
      ref: useRef(),
    },
    developers: {
      text: 'Developers',
      Icon: CodeIcon,
      ref: useRef(),
    },
    advanced: {
      text: t('Preference.Advanced'),
      Icon: PowerIcon,
      ref: useRef(),
    },
    updates: {
      text: 'Updates',
      Icon: SystemUpdateAltIcon,
      ref: useRef(),
    },
    reset: {
      text: 'Reset',
      Icon: RotateLeftIcon,
      ref: useRef(),
    },
    webCatalogApps: {
      text: 'Webcatalog Apps',
      Icon: StorefrontIcon,
      ref: useRef(),
    },
    miscs: {
      text: 'Miscellaneous',
      Icon: MoreHorizIcon,
      ref: useRef(),
    },
  };

  useEffect(() => {
    const scrollTo = window.remote.getGlobal('preferencesScrollTo');
    if (!scrollTo) return;
    sections[scrollTo].ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const debouncedRequestShowRequireRestartDialog = useCallback(
    debounce(async () => await window.service.window.requestShowRequireRestartDialog(), 2500),
    [],
  );

  const [userInfo, userInfoSetter] = useState<IAuthingUserInfo | undefined>(getGithubUserInfo());
  useEffect(() => {
    setGithubUserInfo(userInfo);
  }, [userInfo]);
  // try get token on start up, so Github GraphQL client can use it
  const [accessToken, accessTokenSetter] = useState<string | undefined>(getGithubToken());
  // try get token from local storage, and set to state for gql to use
  useEffect(() => {
    if (accessToken) {
      setGithubToken(accessToken);
    } else {
      setGithubToken();
    }
  }, [accessToken]);

  return (
    <div className={classes.root}>
      <div className={classes.sidebar}>
        <List dense>
          {Object.keys(sections).map((sectionKey, index) => {
            const { Icon, text, ref, hidden } = sections[sectionKey];
            if (hidden) return;
            return (
              <React.Fragment key={sectionKey}>
                {index > 0 && <Divider />}
                <ListItem button onClick={() => ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <ListItemIcon>
                    <Icon />
                  </ListItemIcon>
                  <ListItemText primary={text} />
                </ListItem>
              </React.Fragment>
            );
          })}
        </List>
      </div>

      <div className={classes.inner}>
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.wiki.ref}>
          TiddlyWiki
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List dense disablePadding>
            <ListItem>
              <TextField
                helperText={t('Preference.UserNameDetail')}
                fullWidth
                onChange={async (event) => {
                  await window.service.auth.set('userName', event.target.value);
                }}
                label={t('Preference.UserName')}
                value={userName}
              />
            </ListItem>
          </List>
        </Paper>

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.sync.ref}>
          {t('Preference.Sync')}
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List dense disablePadding>
            <ListItem>
              <ListItemText primary={t('Preference.Token')} secondary={t('Preference.TokenDescription')} />
              <div className={classes.tokenContainer}>
                <GithubTokenForm accessTokenSetter={accessTokenSetter} userInfoSetter={userInfoSetter} accessToken={accessToken} />
              </div>
            </ListItem>
            <ListItem>
              <ListItemText primary={t('Preference.SyncInterval')} secondary={t('Preference.SyncIntervalDescription')} />
              <div className={classes.timePickerContainer}>
                <TimePicker
                  autoOk={false}
                  ampm={false}
                  openTo="hours"
                  views={['hours', 'minutes', 'seconds']}
                  inputFormat="HH:mm:ss"
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
              </div>
            </ListItem>
          </List>
        </Paper>

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.general.ref}>
          {t('Preference.General')}
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List dense disablePadding>
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
            <Divider />
            <ListItem>
              <ListItemText primary={t('Preference.ShowNavigationBar')} secondary={t('Preference.ShowNavigationBarDetail')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  // must show sidebar or navigation bar on Linux
                  // if not, as user can't right-click on menu bar icon
                  // they can't access preferences or notifications
                  checked={(window.remote.getPlatform() === 'linux' && attachToMenubar && !sidebar) || navigationBar}
                  disabled={window.remote.getPlatform() === 'linux' && attachToMenubar && !sidebar}
                  onChange={async (event) => {
                    await window.service.preference.set('navigationBar', event.target.checked);
                    await window.service.workspaceView.realignActiveWorkspace();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {window.remote.getPlatform() === 'darwin' && (
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
                      }}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </>
            )}
            {window.remote.getPlatform() !== 'darwin' && (
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
                primary={window.remote.getPlatform() === 'win32' ? t('Preference.AttachToTaskbar') : t('Preference.AttachToMenuBar')}
                secondary={window.remote.getPlatform() !== 'linux' ? t('Preference.AttachToMenuBarTip') : undefined}
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
          </List>
        </Paper>

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.extensions.ref}>
          Extensions
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List disablePadding dense>
            <ListItem>
              <ListItemText
                primary="Block ads &amp; trackers"
                secondary={
                  <>
                    <span>Powered by </span>
                    <span
                      role="link"
                      tabIndex={0}
                      className={classes.link}
                      onClick={async () => await window.service.native.open('https://cliqz.com/en/whycliqz/adblocking')}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        void window.service.native.open('https://cliqz.com/en/whycliqz/adblocking');
                      }}>
                      Cliqz
                    </span>
                    <span>.</span>
                  </>
                }
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={blockAds}
                  onChange={async (event) => {
                    await window.service.preference.set('blockAds', event.target.checked);
                    await debouncedRequestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText
                primary="Create dark themes for web apps on the fly"
                secondary={
                  <>
                    <span>Powered by </span>
                    <span
                      role="link"
                      tabIndex={0}
                      className={classes.link}
                      onClick={async () => await window.service.native.open('https://darkreader.org/')}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        void window.service.native.open('https://darkreader.org/');
                      }}>
                      Dark Reader
                    </span>
                    <span>.</span>
                    <span> Invert bright colors making them high contrast </span>
                    <span>and easy to read at night.</span>
                  </>
                }
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={themeSource !== 'light' && darkReader}
                  disabled={themeSource === 'light'}
                  onChange={async (event) => {
                    await window.service.preference.set('darkReader', event.target.checked);
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem>
              <ListItemText className={classes.sliderContainer}>
                <Grid container spacing={2}>
                  <Grid classes={{ item: classes.sliderTitleContainer }} item>
                    <Typography id="brightness-slider" variant="body2" gutterBottom={false}>
                      Brightness
                    </Typography>
                  </Grid>
                  <Grid item xs>
                    <Slider
                      classes={{ markLabel: classes.sliderMarkLabel }}
                      value={darkReaderBrightness - 100}
                      disabled={themeSource === 'light' || !darkReader}
                      aria-labelledby="brightness-slider"
                      valueLabelDisplay="auto"
                      step={5}
                      valueLabelFormat={(value) => {
                        if (value > 0) return `+${value}`;
                        return value;
                      }}
                      marks={[
                        {
                          value: darkReaderBrightness - 100,
                          label: `${darkReaderBrightness > 100 ? '+' : ''}${darkReaderBrightness - 100}`,
                        },
                      ]}
                      min={-50}
                      max={50}
                      onChange={async (_, value) => await window.service.preference.set('darkReaderBrightness', (value as number) + 100)}
                    />
                  </Grid>
                </Grid>
                <Grid container spacing={2}>
                  <Grid classes={{ item: classes.sliderTitleContainer }} item>
                    <Typography id="contrast-slider" variant="body2" gutterBottom={false}>
                      Contrast
                    </Typography>
                  </Grid>
                  <Grid item xs>
                    <Slider
                      classes={{ markLabel: classes.sliderMarkLabel }}
                      value={darkReaderContrast - 100}
                      disabled={themeSource === 'light' || !darkReader}
                      aria-labelledby="contrast-slider"
                      valueLabelDisplay="auto"
                      step={5}
                      valueLabelFormat={(value) => {
                        if (value > 0) return `+${value}`;
                        return value;
                      }}
                      marks={[
                        {
                          value: darkReaderContrast - 100,
                          label: `${darkReaderContrast > 100 ? '+' : ''}${darkReaderContrast - 100}`,
                        },
                      ]}
                      min={-50}
                      max={50}
                      onChange={async (_, value) => await window.service.preference.set('darkReaderContrast', (value as number) + 100)}
                    />
                  </Grid>
                </Grid>
                <Grid container spacing={2}>
                  <Grid classes={{ item: classes.sliderTitleContainer }} item>
                    <Typography id="sepia-slider" variant="body2" gutterBottom={false}>
                      Sepia
                    </Typography>
                  </Grid>
                  <Grid item xs>
                    <Slider
                      classes={{ markLabel: classes.sliderMarkLabel }}
                      value={darkReaderSepia}
                      disabled={themeSource === 'light' || !darkReader}
                      aria-labelledby="sepia-slider"
                      valueLabelDisplay="auto"
                      step={5}
                      marks={[
                        {
                          value: darkReaderSepia,
                          label: `${darkReaderSepia}`,
                        },
                      ]}
                      min={0}
                      max={100}
                      onChange={async (_, value) => {
                        await window.service.preference.set('darkReaderSepia', value);
                      }}
                    />
                  </Grid>
                </Grid>
                <Grid container spacing={2}>
                  <Grid classes={{ item: classes.sliderTitleContainer }} item>
                    <Typography id="grayscale-slider" variant="body2" gutterBottom={false}>
                      Grayscale
                    </Typography>
                  </Grid>
                  <Grid item xs>
                    <Slider
                      classes={{ markLabel: classes.sliderMarkLabel }}
                      value={darkReaderGrayscale}
                      disabled={themeSource === 'light' || !darkReader}
                      aria-labelledby="grayscale-slider"
                      valueLabelDisplay="auto"
                      step={5}
                      marks={[
                        {
                          value: darkReaderGrayscale,
                          label: `${darkReaderGrayscale}`,
                        },
                      ]}
                      min={0}
                      max={100}
                      onChange={async (_, value) => {
                        await window.service.preference.set('darkReaderGrayscale', value);
                      }}
                    />
                  </Grid>
                </Grid>
              </ListItemText>
            </ListItem>
          </List>
        </Paper>

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.notifications.ref}>
          Notifications
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List dense disablePadding>
            <ListItem button onClick={async () => await window.service.window.open(WindowNames.notifications)}>
              <ListItemText primary="Control notifications" />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText>
                Automatically disable notifications by schedule:
                <div className={classes.timePickerContainer}>
                  <TimePicker
                    autoOk={false}
                    label="from"
                    renderInput={(timeProps) => <TextField {...timeProps} />}
                    value={new Date(pauseNotificationsByScheduleFrom)}
                    onChange={async (d) => await window.service.preference.set('pauseNotificationsByScheduleFrom', d.toString())}
                    onClose={async () => await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: false })}
                    onOpen={async () => await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: true })}
                    disabled={!pauseNotificationsBySchedule}
                  />
                  <TimePicker
                    autoOk={false}
                    label="to"
                    renderInput={(timeProps) => <TextField {...timeProps} />}
                    value={new Date(pauseNotificationsByScheduleTo)}
                    onChange={async (d) => await window.service.preference.set('pauseNotificationsByScheduleTo', d.toString())}
                    onClose={async () => await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: false })}
                    onOpen={async () => await window.service.window.updateWindowMeta(WindowNames.preferences, { preventClosingWindow: true })}
                    disabled={!pauseNotificationsBySchedule}
                  />
                </div>
                ({window.Intl.DateTimeFormat().resolvedOptions().timeZone})
              </ListItemText>
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
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText primary="Mute audio when notifications are paused" />
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
                window.service.notification({
                  title: 'Test notifications',
                  body: 'It is working!',
                });
              }}>
              <ListItemText
                primary="Test notifications"
                secondary={(() => {
                  // only show this message on macOS Catalina 10.15 & above
                  if (window.remote.getPlatform() === 'darwin' && semver.gte(window.remote.getOSVersion(), '10.15.0')) {
                    return (
                      <>
                        <span>If notifications don&apos;t show up,</span>
                        <span> make sure you enable notifications in </span>
                        <b>
                          <span>macOS Preferences &gt; Notifications &gt; TiddlyGit</span>
                        </b>
                        <span>.</span>
                      </>
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
                  <>
                    <span>TiddlyGit supports notifications out of the box. </span>
                    <span>But for some web apps, to receive notifications, </span>
                    <span>you will need to manually configure additional </span>
                    <span>web app settings. </span>
                    <span
                      role="link"
                      tabIndex={0}
                      className={classes.link}
                      onClick={async () =>
                        await window.service.native.open('https://github.com/atomery/webcatalog/wiki/How-to-Enable-Notifications-in-Web-Apps')
                      }
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        void window.service.native.open('https://github.com/atomery/webcatalog/wiki/How-to-Enable-Notifications-in-Web-Apps');
                      }}>
                      Learn more
                    </span>
                    <span>.</span>
                  </>
                }
              />
            </ListItem>
          </List>
        </Paper>

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.languages.ref}>
          Languages
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List dense disablePadding>
            <ListItem>
              <ListItemText primary="Spell check" />
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
            {window.remote.getPlatform() !== 'darwin' && (
              <>
                <Divider />
                <ListItem button onClick={async () => await window.service.window.open(WindowNames.spellcheck)}>
                  <ListItemText
                    primary="Preferred spell checking languages"
                    secondary={spellcheckLanguages.map((code) => hunspellLanguagesMap[code]).join(' | ')}
                  />
                  <ChevronRightIcon color="action" />
                </ListItem>
              </>
            )}
          </List>
        </Paper>

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.downloads.ref}>
          Downloads
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List dense disablePadding>
            <ListItem
              button
              onClick={() => {
                window.remote.dialog
                  .showOpenDialog({
                    properties: ['openDirectory'],
                  })
                  .then(async (result: any) => {
                    // eslint-disable-next-line promise/always-return
                    if (!result.canceled && result.filePaths) {
                      await window.service.preference.set('downloadPath', result.filePaths[0]);
                    }
                  })
                  .catch((error: any) => {
                    console.log(error); // eslint-disable-line no-console
                  });
              }}>
              <ListItemText primary="Download Location" secondary={downloadPath} />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText primary="Ask where to save each file before downloading" />
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

        <Typography variant="subtitle2" color="textPrimary" className={classes.sectionTitle} ref={sections.network.ref}>
          Network
        </Typography>

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.privacy.ref}>
          Privacy &amp; Security
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List dense disablePadding>
            <ListItem>
              <ListItemText primary="Block ads &amp; trackers" />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={blockAds}
                  onChange={async (event) => {
                    await window.service.preference.set('blockAds', event.target.checked);
                    await debouncedRequestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText primary="Remember last page visited" />
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
            <ListItem>
              <ListItemText primary="Share browsing data between workspaces" />
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
                primary="Ignore certificate errors"
                secondary={
                  <>
                    <span>Not recommended. </span>
                    <span
                      role="link"
                      tabIndex={0}
                      className={classes.link}
                      onClick={async () =>
                        await window.service.native.open('https://groups.google.com/a/chromium.org/d/msg/security-dev/mB2KJv_mMzM/ddMteO9RjXEJ')
                      }
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        void window.service.native.open('https://groups.google.com/a/chromium.org/d/msg/security-dev/mB2KJv_mMzM/ddMteO9RjXEJ');
                      }}>
                      Learn more
                    </span>
                    .
                  </>
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
            <ListItem button onClick={window.service.preference.clearBrowsingDataWithConfirm}>
              <ListItemText primary="Clear browsing data" secondary="Clear cookies, cache, and more" />
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

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.system.ref}>
          System
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List dense disablePadding>
            <ListItemDefaultBrowser />
            <Divider />
            <ListItemDefaultMailClient />
            <Divider />
            <StatedMenu
              id="openAtLogin"
              buttonElement={
                <ListItem button>
                  <ListItemText primary="Open at login" secondary={getOpenAtLoginString(openAtLogin)} />
                  <ChevronRightIcon color="action" />
                </ListItem>
              }>
              <MenuItem dense onClick={async () => await window.service.systemPreference.setSystemPreference('openAtLogin', 'yes')}>
                Yes
              </MenuItem>
              <MenuItem dense onClick={async () => await window.service.systemPreference.setSystemPreference('openAtLogin', 'yes-hidden')}>
                Yes, but minimized
              </MenuItem>
              <MenuItem dense onClick={async () => await window.service.systemPreference.setSystemPreference('openAtLogin', 'no')}>
                No
              </MenuItem>
            </StatedMenu>
          </List>
        </Paper>

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.developers.ref}>
          Developers
        </Typography>

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.advanced.ref}>
          Advanced
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List dense disablePadding>
            <ListItem button onClick={async () => await window.service.native.open(await window.service.context.get('LOG_FOLDER'), true)}>
              <ListItemText primary={t('Preference.OpenLogFolder')} secondary={t('Preference.OpenLogFolderDetail')} />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText
                primary="Hibernate unused workspaces at app launch"
                secondary="Hibernate all workspaces at launch, except the last active workspace."
              />
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
            {window.remote.getPlatform() === 'darwin' && (
              <>
                <Divider />
                <ListItem>
                  <ListItemText
                    primary="Swipe with three fingers to navigate"
                    secondary={
                      <>
                        <span>Navigate between pages with 3-finger gestures. </span>
                        <span>Swipe left to go back or swipe right to go forward.</span>
                        <br />
                        <span>To enable it, you also need to change </span>
                        <b>macOS Preferences &gt; Trackpad &gt; More Gestures &gt; Swipe between page</b>
                        <span> to </span>
                        <b>Swipe with three fingers</b>
                        <span> or </span>
                        <b>Swipe with two or three fingers.</b>
                      </>
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
            <Divider />
            <ListItem>
              <ListItemText primary="Use hardware acceleration when available" />
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

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.updates.ref}>
          Updates
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List dense disablePadding>
            <ListItem
              button
              onClick={async () => await window.service.updater.checkForUpdates(false)}
              disabled={
                updaterStatus === 'checking-for-update' ||
                updaterStatus === 'download-progress' ||
                updaterStatus === 'download-progress' ||
                updaterStatus === 'update-available'
              }>
              <ListItemText
                primary={updaterStatus === 'update-downloaded' ? 'Restart to Apply Updates' : 'Check for Updates'}
                secondary={getUpdaterDesc(updaterStatus, updaterInfo)}
              />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText primary="Receive pre-release updates" />
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

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.reset.ref}>
          Reset
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List dense disablePadding>
            <ListItem button onClick={window.service.preference.resetWithConfirm}>
              <ListItemText primary="Restore preferences to their original defaults" />
              <ChevronRightIcon color="action" />
            </ListItem>
          </List>
        </Paper>

        <Typography variant="subtitle2" color="textPrimary" className={classes.sectionTitle} ref={sections.webCatalogApps.ref}>
          WebCatalog Apps
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List disablePadding dense>
            <ListItem button onClick={async () => await window.service.native.open('https://github.com/webcatalog/webcatalog-engine')}>
              <ListItemText secondary="WebCatalog is the initial code founder of TiddlyGit, we reuse lots of important code from the open-source WebCatalog, many thanks to WebCatalog and its author Quang Lam" />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem button onClick={async () => await window.service.native.open('https://webcatalogapp.com?utm_source=tiddlygit_app')}>
              <ListItemText
                primary={<img src={webcatalogLogo} alt="WebCatalog" className={classes.logo} />}
                secondary="Magically turn any websites into Mac apps. Work more productively and forget about switching tabs. "
              />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem button onClick={async () => await window.service.native.open('https://translatiumapp.com?utm_source=tiddlygit_app')}>
              <ListItemText primary={<img src={translatiumLogo} alt="Translatium" className={classes.logo} />} secondary="Translate Any Languages like a Pro" />
              <ChevronRightIcon color="action" />
            </ListItem>
          </List>
        </Paper>

        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.miscs.ref}>
          Miscellaneous
        </Typography>
        <Paper elevation={0} className={classes.paper}>
          <List dense disablePadding>
            <ListItem button onClick={async () => await window.service.window.open(WindowNames.about)}>
              <ListItemText primary="About" />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem button onClick={async () => await window.service.native.open('https://github.com/tiddly-gittly/tiddlygit-desktop/')}>
              <ListItemText primary="Website" />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem button onClick={async () => await window.service.native.open('https://github.com/tiddly-gittly/tiddlygit-desktop/issues')}>
              <ListItemText primary="Support" />
              <ChevronRightIcon color="action" />
            </ListItem>
            <Divider />
            <ListItem button onClick={window.service.native.quit}>
              <ListItemText primary="Quit" />
              <ChevronRightIcon color="action" />
            </ListItem>
          </List>
        </Paper>
      </div>
    </div>
  );
}
