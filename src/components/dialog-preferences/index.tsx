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

import connectComponent from '../../helpers/connect-component';
import { getGithubUserInfo, setGithubUserInfo } from '../../helpers/user-info';

// @ts-expect-error ts-migrate(6142) FIXME: Module '../shared/stated-menu' was resolved to '/U... Remove this comment to see the full error message
import StatedMenu from '../shared/stated-menu';

import hunspellLanguagesMap from '../../constants/hunspell-languages';

// @ts-expect-error ts-migrate(2307) FIXME: Cannot find module '../../images/webcatalog-logo.s... Remove this comment to see the full error message
import webcatalogLogo from '../../images/webcatalog-logo.svg';
// @ts-expect-error ts-migrate(2307) FIXME: Cannot find module '../../images/translatium-logo.... Remove this comment to see the full error message
import translatiumLogo from '../../images/translatium-logo.svg';

// @ts-expect-error ts-migrate(6142) FIXME: Module './list-item-default-mail-client' was resol... Remove this comment to see the full error message
import ListItemDefaultMailClient from './list-item-default-mail-client';
// @ts-expect-error ts-migrate(6142) FIXME: Module './list-item-default-browser' was resolved ... Remove this comment to see the full error message
import ListItemDefaultBrowser from './list-item-default-browser';
// @ts-expect-error ts-migrate(6142) FIXME: Module '../shared/git-token-form' was resolved to ... Remove this comment to see the full error message
import GitTokenForm, { getGithubToken, setGithubToken } from '../shared/git-token-form';
import type { IUserInfo } from '../../helpers/user-info';

import {
  requestCheckForUpdates,
  requestClearBrowsingData,
  requestOpen,
  requestQuit,
  requestRealignActiveWorkspace,
  requestResetPreferences,
  requestSetPreference,
  requestSetSystemPreference,
  requestShowAboutWindow,
  requestShowCodeInjectionWindow,
  requestShowCustomUserAgentWindow,
  requestShowNotification,
  requestShowNotificationsWindow,
  requestShowProxyWindow,
  requestShowRequireRestartDialog,
  requestShowSpellcheckLanguagesWindow,
  getLogFolderPath,
} from '../../senders';

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
  allowNodeInJsCodeInjection: boolean;
  allowPrerelease: boolean;
  askForDownloadPath: boolean;
  attachToMenubar: boolean;
  blockAds: boolean;
  classes: any;
  cssCodeInjection?: string;
  customUserAgent?: string;
  darkReader: boolean;
  darkReaderBrightness: number;
  darkReaderContrast: number;
  darkReaderGrayscale: number;
  darkReaderSepia: number;
  downloadPath: string;
  hibernateUnusedWorkspacesAtLaunch: boolean;
  hideMenuBar: boolean;
  ignoreCertificateErrors: boolean;
  jsCodeInjection?: string;
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

const Preferences = ({
  allowNodeInJsCodeInjection,
  allowPrerelease,
  askForDownloadPath,
  attachToMenubar,
  blockAds,
  classes,
  cssCodeInjection,
  customUserAgent,
  darkReader,
  darkReaderBrightness,
  darkReaderContrast,
  darkReaderGrayscale,
  darkReaderSepia,
  downloadPath,
  hibernateUnusedWorkspacesAtLaunch,
  hideMenuBar,
  ignoreCertificateErrors,
  jsCodeInjection,
  navigationBar,
  openAtLogin,
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
  updaterInfo,
  updaterStatus,
  useHardwareAcceleration,
  userName,
}: PreferencesProps) => {
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
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    sections[scrollTo].ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const debouncedRequestShowRequireRestartDialog = useCallback(
    debounce(() => requestShowRequireRestartDialog(), 2500),
    [],
  );

  const [userInfo, userInfoSetter] = useState<IUserInfo | void>(getGithubUserInfo());
  useEffect(() => {
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'void | IUserInfo' is not assigna... Remove this comment to see the full error message
    setGithubUserInfo(userInfo);
  }, [userInfo]);
  // try get token on start up, so Github GraphQL client can use it
  const [accessToken, accessTokenSetter] = useState<string | void>(getGithubToken());
  // try get token from local storage, and set to state for gql to use
  useEffect(() => {
    if (accessToken) {
      setGithubToken(accessToken);
    } else {
      setGithubToken();
    }
  }, [accessToken]);

  return (
    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className={classes.root}>
      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className={classes.sidebar}>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <List dense>
          {Object.keys(sections).map((sectionKey, index) => {
            // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const { Icon, text, ref, hidden } = sections[sectionKey];
            if (hidden) return;
            return (
              // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <React.Fragment key={sectionKey}>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {index > 0 && <Divider />}
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <ListItem button onClick={() => ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ListItemIcon>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Icon />
                  </ListItemIcon>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ListItemText primary={text} />
                </ListItem>
              </React.Fragment>
            );
          })}
        </List>
      </div>

      {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className={classes.inner}>
        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.wiki.ref}>
          TiddlyWiki
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <TextField
                helperText={t('Preference.UserNameDetail')}
                fullWidth
                onChange={(event) => {
                  requestSetPreference('userName', event.target.value);
                }}
                label={t('Preference.UserName')}
                value={userName}
              />
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.sync.ref}>
          {t('Preference.Sync')}
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary={t('Preference.Token')} secondary={t('Preference.TokenDescription')} />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className={classes.tokenContainer}>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <GitTokenForm accessTokenSetter={accessTokenSetter} userInfoSetter={userInfoSetter} accessToken={accessToken} />
              </div>
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary={t('Preference.SyncInterval')} secondary={t('Preference.SyncIntervalDescription')} />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className={classes.timePickerContainer}>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <TimePicker
                  // @ts-expect-error ts-migrate(2322) FIXME: Type '{ autoOk: boolean; ampm: false; openTo: "hou... Remove this comment to see the full error message
                  autoOk={false}
                  ampm={false}
                  openTo="hours"
                  views={['hours', 'minutes', 'seconds']}
                  inputFormat="HH:mm:ss"
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  renderInput={(timeProps) => <TextField {...timeProps} />}
                  value={fromUnixTime(syncDebounceInterval / 1000 + new Date().getTimezoneOffset() * 60)}
                  onChange={(date) => {
                    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'Date | null' is not assignable t... Remove this comment to see the full error message
                    const timeWithoutDate = setDate(setMonth(setYear(date, 1970), 0), 1);
                    const utcTime = (timeWithoutDate.getTime() / 1000 - new Date().getTimezoneOffset() * 60) * 1000;
                    requestSetPreference('syncDebounceInterval', utcTime);
                    debouncedRequestShowRequireRestartDialog();
                  }}
                  onClose={() => {
                    window.preventClosingWindow = false;
                  }}
                  onOpen={() => {
                    window.preventClosingWindow = true;
                  }}
                />
              </div>
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.general.ref}>
          {t('Preference.General')}
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <StatedMenu
              id="theme"
              buttonElement={
                // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <ListItem button>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ListItemText primary={t('Preference.Theme')} secondary={getThemeString(themeSource)} />
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ChevronRightIcon color="action" />
                </ListItem>
              }>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <MenuItem dense onClick={() => requestSetPreference('themeSource', 'system')}>
                {t('Preference.SystemDefalutTheme')}
              </MenuItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <MenuItem dense onClick={() => requestSetPreference('themeSource', 'light')}>
                {t('Preference.LightTheme')}
              </MenuItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <MenuItem dense onClick={() => requestSetPreference('themeSource', 'dark')}>
                {t('Preference.DarkTheme')}
              </MenuItem>
            </StatedMenu>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary={t('Preference.ShowSideBar')} secondary={t('Preference.ShowSideBarDetail')} />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={sidebar}
                  onChange={(event) => {
                    requestSetPreference('sidebar', event.target.checked);
                    requestRealignActiveWorkspace();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary={t('Preference.ShowSideBarShortcut')} />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={sidebarShortcutHints}
                  onChange={(event) => {
                    requestSetPreference('sidebarShortcutHints', event.target.checked);
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary={t('Preference.ShowNavigationBar')} secondary={t('Preference.ShowNavigationBarDetail')} />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  // must show sidebar or navigation bar on Linux
                  // if not, as user can't right-click on menu bar icon
                  // they can't access preferences or notifications
                  checked={(window.remote.getPlatform() === 'linux' && attachToMenubar && !sidebar) || navigationBar}
                  disabled={window.remote.getPlatform() === 'linux' && attachToMenubar && !sidebar}
                  onChange={(event) => {
                    requestSetPreference('navigationBar', event.target.checked);
                    requestRealignActiveWorkspace();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {window.remote.getPlatform() === 'darwin' && (
              // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Divider />
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <ListItem>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ListItemText primary={t('Preference.ShowTitleBar')} secondary={t('Preference.ShowTitleBarDetail')} />
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ListItemSecondaryAction>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Switch
                      edge="end"
                      color="primary"
                      checked={titleBar}
                      onChange={(event) => {
                        requestSetPreference('titleBar', event.target.checked);
                        requestRealignActiveWorkspace();
                      }}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </>
            )}
            {window.remote.getPlatform() !== 'darwin' && (
              // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Divider />
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <ListItem>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ListItemText primary={t('Preference.HideMenuBar')} secondary={t('Preference.HideMenuBarDetail')} />
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ListItemSecondaryAction>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Switch
                      edge="end"
                      color="primary"
                      checked={hideMenuBar}
                      onChange={(event) => {
                        requestSetPreference('hideMenuBar', event.target.checked);
                        requestShowRequireRestartDialog();
                      }}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </>
            )}
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText
                primary={window.remote.getPlatform() === 'win32' ? t('Preference.AttachToTaskbar') : t('Preference.AttachToMenuBar')}
                secondary={window.remote.getPlatform() !== 'linux' ? t('Preference.AttachToMenuBarTip') : undefined}
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={attachToMenubar}
                  onChange={(event) => {
                    requestSetPreference('attachToMenubar', event.target.checked);
                    requestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.extensions.ref}>
          Extensions
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List disablePadding dense>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText
                primary="Block ads &amp; trackers"
                secondary={
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>Powered by </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span
                      role="link"
                      tabIndex={0}
                      className={classes.link}
                      // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                      onClick={() => requestOpen('https://cliqz.com/en/whycliqz/adblocking')}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                        requestOpen('https://cliqz.com/en/whycliqz/adblocking');
                      }}>
                      Cliqz
                    </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>.</span>
                  </>
                }
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={blockAds}
                  onChange={(event) => {
                    requestSetPreference('blockAds', event.target.checked);
                    requestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText
                primary="Create dark themes for web apps on the fly"
                secondary={
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>Powered by </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span
                      role="link"
                      tabIndex={0}
                      className={classes.link}
                      // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                      onClick={() => requestOpen('https://darkreader.org/')}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                        requestOpen('https://darkreader.org/');
                      }}>
                      Dark Reader
                    </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>.</span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span> Invert bright colors making them high contrast </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>and easy to read at night.</span>
                  </>
                }
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={themeSource !== 'light' && darkReader}
                  disabled={themeSource === 'light'}
                  onChange={(event) => {
                    requestSetPreference('darkReader', event.target.checked);
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText className={classes.sliderContainer}>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Grid container spacing={2}>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Grid classes={{ item: classes.sliderTitleContainer }} item>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Typography id="brightness-slider" variant="body2" gutterBottom={false}>
                      Brightness
                    </Typography>
                  </Grid>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Grid item xs>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                      onChange={(_, value) => {
                        // @ts-expect-error ts-migrate(2365) FIXME: Operator '+' cannot be applied to types 'number | ... Remove this comment to see the full error message
                        requestSetPreference('darkReaderBrightness', value + 100);
                      }}
                    />
                  </Grid>
                </Grid>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Grid container spacing={2}>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Grid classes={{ item: classes.sliderTitleContainer }} item>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Typography id="contrast-slider" variant="body2" gutterBottom={false}>
                      Contrast
                    </Typography>
                  </Grid>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Grid item xs>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                      onChange={(_, value) => {
                        // @ts-expect-error ts-migrate(2365) FIXME: Operator '+' cannot be applied to types 'number | ... Remove this comment to see the full error message
                        requestSetPreference('darkReaderContrast', value + 100);
                      }}
                    />
                  </Grid>
                </Grid>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Grid container spacing={2}>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Grid classes={{ item: classes.sliderTitleContainer }} item>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Typography id="sepia-slider" variant="body2" gutterBottom={false}>
                      Sepia
                    </Typography>
                  </Grid>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Grid item xs>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                      onChange={(_, value) => {
                        requestSetPreference('darkReaderSepia', value);
                      }}
                    />
                  </Grid>
                </Grid>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Grid container spacing={2}>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Grid classes={{ item: classes.sliderTitleContainer }} item>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Typography id="grayscale-slider" variant="body2" gutterBottom={false}>
                      Grayscale
                    </Typography>
                  </Grid>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <Grid item xs>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
                      onChange={(_, value) => {
                        requestSetPreference('darkReaderGrayscale', value);
                      }}
                    />
                  </Grid>
                </Grid>
              </ListItemText>
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.notifications.ref}>
          Notifications
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={requestShowNotificationsWindow}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Control notifications" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText>
                Automatically disable notifications by schedule:
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className={classes.timePickerContainer}>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <TimePicker
                    // @ts-expect-error ts-migrate(2322) FIXME: Type '{ autoOk: boolean; label: string; renderInpu... Remove this comment to see the full error message
                    autoOk={false}
                    label="from"
                    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    renderInput={(timeProps) => <TextField {...timeProps} />}
                    value={new Date(pauseNotificationsByScheduleFrom)}
                    // @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
                    onChange={(d) => requestSetPreference('pauseNotificationsByScheduleFrom', d.toString())}
                    onClose={() => {
                      window.preventClosingWindow = false;
                    }}
                    onOpen={() => {
                      window.preventClosingWindow = true;
                    }}
                    disabled={!pauseNotificationsBySchedule}
                  />
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <TimePicker
                    // @ts-expect-error ts-migrate(2322) FIXME: Type '{ autoOk: boolean; label: string; renderInpu... Remove this comment to see the full error message
                    autoOk={false}
                    label="to"
                    // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    renderInput={(timeProps) => <TextField {...timeProps} />}
                    value={new Date(pauseNotificationsByScheduleTo)}
                    // @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
                    onChange={(d) => requestSetPreference('pauseNotificationsByScheduleTo', d.toString())}
                    onClose={() => {
                      window.preventClosingWindow = false;
                    }}
                    onOpen={() => {
                      window.preventClosingWindow = true;
                    }}
                    disabled={!pauseNotificationsBySchedule}
                  />
                </div>
                ({window.Intl.DateTimeFormat().resolvedOptions().timeZone})
              </ListItemText>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={pauseNotificationsBySchedule}
                  onChange={(event) => {
                    requestSetPreference('pauseNotificationsBySchedule', event.target.checked);
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Mute audio when notifications are paused" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={pauseNotificationsMuteAudio}
                  onChange={(event) => {
                    requestSetPreference('pauseNotificationsMuteAudio', event.target.checked);
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Show unread count badge" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={unreadCountBadge}
                  onChange={(event) => {
                    requestSetPreference('unreadCountBadge', event.target.checked);
                    requestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem
              button
              onClick={() => {
                requestShowNotification({
                  title: 'Test notifications',
                  body: 'It is working!',
                });
              }}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText
                primary="Test notifications"
                secondary={(() => {
                  // only show this message on macOS Catalina 10.15 & above
                  if (window.remote.getPlatform() === 'darwin' && semver.gte(window.remote.getOSVersion(), '10.15.0')) {
                    return (
                      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                      <>
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span>If notifications don&apos;t show up,</span>
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span> make sure you enable notifications in </span>
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <b>
                          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                          <span>macOS Preferences &gt; Notifications &gt; TiddlyGit</span>
                        </b>
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span>.</span>
                      </>
                    );
                  }
                })()}
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText
                secondary={
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>TiddlyGit supports notifications out of the box. </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>But for some web apps, to receive notifications, </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>you will need to manually configure additional </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>web app settings. </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span
                      role="link"
                      tabIndex={0}
                      className={classes.link}
                      // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                      onClick={() => requestOpen('https://github.com/atomery/webcatalog/wiki/How-to-Enable-Notifications-in-Web-Apps')}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                        requestOpen('https://github.com/atomery/webcatalog/wiki/How-to-Enable-Notifications-in-Web-Apps');
                      }}>
                      Learn more
                    </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>.</span>
                  </>
                }
              />
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.languages.ref}>
          Languages
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Spell check" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={spellcheck}
                  onChange={(event) => {
                    requestSetPreference('spellcheck', event.target.checked);
                    requestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {window.remote.getPlatform() !== 'darwin' && (
              // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Divider />
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <ListItem button onClick={requestShowSpellcheckLanguagesWindow}>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ListItemText
                    primary="Preferred spell checking languages"
                    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    secondary={spellcheckLanguages.map((code) => hunspellLanguagesMap[code]).join(' | ')}
                  />
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ChevronRightIcon color="action" />
                </ListItem>
              </>
            )}
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.downloads.ref}>
          Downloads
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem
              button
              onClick={() => {
                window.remote.dialog
                  .showOpenDialog({
                    properties: ['openDirectory'],
                  })
                  .then((result: any) => {
                    // eslint-disable-next-line promise/always-return
                    if (!result.canceled && result.filePaths) {
                      requestSetPreference('downloadPath', result.filePaths[0]);
                    }
                  })
                  .catch((error: any) => {
                    console.log(error); // eslint-disable-line no-console
                  });
              }}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Download Location" secondary={downloadPath} />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Ask where to save each file before downloading" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={askForDownloadPath}
                  onChange={(event) => {
                    requestSetPreference('askForDownloadPath', event.target.checked);
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" color="textPrimary" className={classes.sectionTitle} ref={sections.network.ref}>
          Network
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List disablePadding dense>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={requestShowProxyWindow}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Configure proxy settings (BETA)" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.privacy.ref}>
          Privacy &amp; Security
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Block ads &amp; trackers" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={blockAds}
                  onChange={(event) => {
                    requestSetPreference('blockAds', event.target.checked);
                    requestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Remember last page visited" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={rememberLastPageVisited}
                  onChange={(event) => {
                    requestSetPreference('rememberLastPageVisited', event.target.checked);
                    requestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Share browsing data between workspaces" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={shareWorkspaceBrowsingData}
                  onChange={(event) => {
                    requestSetPreference('shareWorkspaceBrowsingData', event.target.checked);
                    requestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText
                primary="Ignore certificate errors"
                secondary={
                  // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span>Not recommended. </span>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <span
                      role="link"
                      tabIndex={0}
                      className={classes.link}
                      // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                      onClick={() => requestOpen('https://groups.google.com/a/chromium.org/d/msg/security-dev/mB2KJv_mMzM/ddMteO9RjXEJ')}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
                        requestOpen('https://groups.google.com/a/chromium.org/d/msg/security-dev/mB2KJv_mMzM/ddMteO9RjXEJ');
                      }}>
                      Learn more
                    </span>
                    .
                  </>
                }
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={ignoreCertificateErrors}
                  onChange={(event) => {
                    requestSetPreference('ignoreCertificateErrors', event.target.checked);
                    requestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={requestClearBrowsingData}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Clear browsing data" secondary="Clear cookies, cache, and more" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={() => requestOpen('https://github.com/tiddly-gittly/TiddlyGit-Desktop/blob/master/PrivacyPolicy.md')}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Privacy Policy" />
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.system.ref}>
          System
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItemDefaultBrowser />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItemDefaultMailClient />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <StatedMenu
              id="openAtLogin"
              buttonElement={
                // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <ListItem button>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ListItemText primary="Open at login" secondary={getOpenAtLoginString(openAtLogin)} />
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ChevronRightIcon color="action" />
                </ListItem>
              }>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <MenuItem dense onClick={() => requestSetSystemPreference('openAtLogin', 'yes')}>
                Yes
              </MenuItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <MenuItem dense onClick={() => requestSetSystemPreference('openAtLogin', 'yes-hidden')}>
                Yes, but minimized
              </MenuItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <MenuItem dense onClick={() => requestSetSystemPreference('openAtLogin', 'no')}>
                No
              </MenuItem>
            </StatedMenu>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.developers.ref}>
          Developers
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={requestShowCustomUserAgentWindow}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Custom User Agent" secondary={customUserAgent || 'Not set'} classes={{ secondary: classes.secondaryEllipsis }} />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={() => requestShowCodeInjectionWindow('js')}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText
                primary="JS Code Injection"
                secondary={jsCodeInjection ? `Set ${allowNodeInJsCodeInjection ? ' (with access to Node.JS & Electron APIs)' : ''}` : 'Not set'}
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={() => requestShowCodeInjectionWindow('css')}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="CSS Code Injection" secondary={cssCodeInjection ? 'Set' : 'Not set'} />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.advanced.ref}>
          Advanced
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={() => requestOpen(getLogFolderPath(), true)}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary={t('Preference.OpenLogFolder')} secondary={t('Preference.OpenLogFolderDetail')} />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText
                primary="Hibernate unused workspaces at app launch"
                secondary="Hibernate all workspaces at launch, except the last active workspace."
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={hibernateUnusedWorkspacesAtLaunch}
                  onChange={(event) => {
                    requestSetPreference('hibernateUnusedWorkspacesAtLaunch', event.target.checked);
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            {window.remote.getPlatform() === 'darwin' && (
              // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Divider />
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <ListItem>
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ListItemText
                    primary="Swipe with three fingers to navigate"
                    secondary={
                      // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                      <>
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span>Navigate between pages with 3-finger gestures. </span>
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span>Swipe left to go back or swipe right to go forward.</span>
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <br />
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span>To enable it, you also need to change </span>
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <b>macOS Preferences &gt; Trackpad &gt; More Gestures &gt; Swipe between page</b>
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span> to </span>
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <b>Swipe with three fingers</b>
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <span> or </span>
                        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <b>Swipe with two or three fingers.</b>
                      </>
                    }
                  />
                  {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <ListItemSecondaryAction>
                    {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Switch
                      edge="end"
                      color="primary"
                      checked={swipeToNavigate}
                      onChange={(event) => {
                        requestSetPreference('swipeToNavigate', event.target.checked);
                        requestShowRequireRestartDialog();
                      }}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </>
            )}
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Use hardware acceleration when available" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={useHardwareAcceleration}
                  onChange={(event) => {
                    requestSetPreference('useHardwareAcceleration', event.target.checked);
                    requestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.updates.ref}>
          Updates
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem
              button
              onClick={() => requestCheckForUpdates(false)}
              disabled={
                updaterStatus === 'checking-for-update' ||
                updaterStatus === 'download-progress' ||
                updaterStatus === 'download-progress' ||
                updaterStatus === 'update-available'
              }>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText
                primary={updaterStatus === 'update-downloaded' ? 'Restart to Apply Updates' : 'Check for Updates'}
                secondary={getUpdaterDesc(updaterStatus, updaterInfo)}
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Receive pre-release updates" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemSecondaryAction>
                {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Switch
                  edge="end"
                  color="primary"
                  checked={allowPrerelease}
                  onChange={(event) => {
                    requestSetPreference('allowPrerelease', event.target.checked);
                    requestShowRequireRestartDialog();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.reset.ref}>
          Reset
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={requestResetPreferences}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Restore preferences to their original defaults" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" color="textPrimary" className={classes.sectionTitle} ref={sections.webCatalogApps.ref}>
          WebCatalog Apps
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List disablePadding dense>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={() => requestOpen('https://github.com/webcatalog/webcatalog-engine')}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText secondary="WebCatalog is the initial code founder of TiddlyGit, we reuse lots of important code from the open-source WebCatalog, many thanks to WebCatalog and its author Quang Lam" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={() => requestOpen('https://webcatalogapp.com?utm_source=tiddlygit_app')}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText
                // @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                primary={<img src={webcatalogLogo} alt="WebCatalog" className={classes.logo} />}
                secondary="Magically turn any websites into Mac apps. Work more productively and forget about switching tabs. "
              />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={() => requestOpen('https://translatiumapp.com?utm_source=tiddlygit_app')}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary={<img src={translatiumLogo} alt="Translatium" className={classes.logo} />} secondary="Translate Any Languages like a Pro" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
          </List>
        </Paper>

        {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
        <Typography variant="subtitle2" className={classes.sectionTitle} ref={sections.miscs.ref}>
          Miscellaneous
        </Typography>
        {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Paper elevation={0} className={classes.paper}>
          {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <List dense disablePadding>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={requestShowAboutWindow}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="About" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={() => requestOpen('https://github.com/tiddly-gittly/tiddlygit-desktop/')}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Website" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={() => requestOpen('https://github.com/tiddly-gittly/tiddlygit-desktop/issues')}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Support" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Divider />
            {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <ListItem button onClick={requestQuit}>
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ListItemText primary="Quit" />
              {/* @ts-expect-error ts-migrate(17004) FIXME: Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ChevronRightIcon color="action" />
            </ListItem>
          </List>
        </Paper>
      </div>
    </div>
  );
};

const mapStateToProps = (state: any) => ({
  allowNodeInJsCodeInjection: state.preferences.allowNodeInJsCodeInjection,
  allowPrerelease: state.preferences.allowPrerelease,
  askForDownloadPath: state.preferences.askForDownloadPath,
  attachToMenubar: state.preferences.attachToMenubar,
  blockAds: state.preferences.blockAds,
  cssCodeInjection: state.preferences.cssCodeInjection,
  customUserAgent: state.preferences.customUserAgent,
  darkReader: state.preferences.darkReader,
  darkReaderBrightness: state.preferences.darkReaderBrightness,
  darkReaderContrast: state.preferences.darkReaderContrast,
  darkReaderGrayscale: state.preferences.darkReaderGrayscale,
  darkReaderSepia: state.preferences.darkReaderSepia,
  downloadPath: state.preferences.downloadPath,
  hibernateUnusedWorkspacesAtLaunch: state.preferences.hibernateUnusedWorkspacesAtLaunch,
  hideMenuBar: state.preferences.hideMenuBar,
  ignoreCertificateErrors: state.preferences.ignoreCertificateErrors,
  isDefaultMailClient: state.general.isDefaultMailClient,
  isDefaultWebBrowser: state.general.isDefaultWebBrowser,
  jsCodeInjection: state.preferences.jsCodeInjection,
  navigationBar: state.preferences.navigationBar,
  openAtLogin: state.systemPreferences.openAtLogin,
  pauseNotificationsBySchedule: state.preferences.pauseNotificationsBySchedule,
  pauseNotificationsByScheduleFrom: state.preferences.pauseNotificationsByScheduleFrom,
  pauseNotificationsByScheduleTo: state.preferences.pauseNotificationsByScheduleTo,
  pauseNotificationsMuteAudio: state.preferences.pauseNotificationsMuteAudio,
  rememberLastPageVisited: state.preferences.rememberLastPageVisited,
  shareWorkspaceBrowsingData: state.preferences.shareWorkspaceBrowsingData,
  sidebar: state.preferences.sidebar,
  sidebarShortcutHints: state.preferences.sidebarShortcutHints,
  spellcheck: state.preferences.spellcheck,
  spellcheckLanguages: state.preferences.spellcheckLanguages,
  swipeToNavigate: state.preferences.swipeToNavigate,
  syncDebounceInterval: state.preferences.syncDebounceInterval,
  themeSource: state.preferences.themeSource,
  titleBar: state.preferences.titleBar,
  unreadCountBadge: state.preferences.unreadCountBadge,
  updaterInfo: state.updater.info,
  updaterStatus: state.updater.status,
  useHardwareAcceleration: state.preferences.useHardwareAcceleration,
  userName: state.preferences.userName,
});

export default connectComponent(Preferences, mapStateToProps, undefined, styles);
