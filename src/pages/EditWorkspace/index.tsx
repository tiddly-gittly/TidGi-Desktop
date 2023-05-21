/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable unicorn/no-useless-undefined */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable unicorn/no-null */
import {
  Button as ButtonRaw,
  Divider,
  Link,
  List as ListRaw,
  ListItem as ListItemRaw,
  ListItemSecondaryAction,
  ListItemText as ListItemTextRaw,
  Paper,
  Switch,
  TextField as TextFieldRaw,
  Tooltip,
  Typography,
} from '@material-ui/core';
import { Autocomplete } from '@material-ui/lab';
import React from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import styled, { css } from 'styled-components';
import defaultIcon from '../../images/default-icon.png';

import { usePromiseValue } from '@/helpers/useServiceValue';
import type { ISubWikiPluginContent } from '@services/wiki/plugin/subWikiPlugin';
import { WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { useWorkspaceObservable } from '@services/workspaces/hooks';
import { IWorkspace } from '@services/workspaces/interface';
import { useForm } from './useForm';

import { useRestartSnackbar } from '@/components/RestartSnackbar';
import { TokenForm } from '@/components/TokenForm';
import { DEFAULT_USER_NAME, getTidGiAuthHeaderWithToken } from '@/constants/auth';
import { rootTiddlers } from '@/constants/defaultTiddlerNames';
import { defaultServerIP } from '@/constants/urls';
import { useActualIp } from '@services/native/hooks';
import { SupportedStorageServices } from '@services/types';
import { isEqual } from 'lodash';
import { SyncedWikiDescription } from '../AddWorkspace/Description';
import { GitRepoUrlForm } from '../AddWorkspace/GitRepoUrlForm';

const Root = styled(Paper)`
  height: 100%;
  width: 100%;
  padding: 20px;
  /** for SaveCancelButtonsContainer 's height */
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.palette.background.paper};
`;
const FlexGrow = styled.div`
  flex: 1;
`;
const Button = styled(ButtonRaw)`
  float: right;
  margin-left: 10px;
`;
const TextField = styled(TextFieldRaw)`
  margin-bottom: 10px;
`;
TextField.defaultProps = {
  fullWidth: true,
  margin: 'dense',
  size: 'small',
  variant: 'filled',
  InputLabelProps: {
    shrink: true,
  },
};
const AvatarFlex = styled.div`
  display: flex;
`;
const AvatarLeft = styled.div`
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 0;
  padding-right: 10px;
`;
const AvatarRight = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: flex-start;
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 10px;
  padding-right: 0;
`;
/**
 * border: theme.palette.type === 'dark' ? 'none': '1px solid rgba(0, 0, 0, 0.12)';
 */
const Avatar = styled.div<{ transparentBackground?: boolean }>`
  height: 85px;
  width: 85px;
  border-radius: 4px;
  color: #333;
  font-size: 32px;
  line-height: 64px;
  text-align: center;
  font-weight: 500;
  text-transform: uppercase;
  user-select: none;

  overflow: hidden;
  ${({ transparentBackground }) => {
  if (transparentBackground === true) {
    return css`
        background: transparent;
        border: none;
        border-radius: 0;
      `;
  }
}}
`;
const SaveCancelButtonsContainer = styled.div`
  position: fixed;
  left: 0;
  bottom: 0;

  height: auto;
  width: 100%;
  padding: 5px;
  background-color: ${({ theme }) => theme.palette.background.paper};
  opacity: 0.9;
  backdrop-filter: blur(10px);
`;
const AvatarPicture = styled.img`
  height: 100%;
  width: 100%;
`;
const PictureButton = styled(ButtonRaw)``;
PictureButton.defaultProps = {
  variant: 'outlined',
  size: 'small',
};
const Caption = styled(Typography)`
  display: block;
`;
Caption.defaultProps = {
  variant: 'caption',
};
const List = styled(ListRaw)`
  & > li > div {
    padding-top: 0;
    padding-bottom: 0;
  }
`;
export const ListItem: typeof ListItemRaw = styled(ListItemRaw)`
  svg {
    color: ${({ theme }) => theme.palette.action.active};
  }
  p,
  label {
    color: ${({ theme }) => theme.palette.text.secondary};
  }
  div[role='button'] {
    color: ${({ theme }) => theme.palette.text.primary};
  }
`;
export const ListItemText: typeof ListItemTextRaw = styled(ListItemTextRaw)`
  color: ${({ theme }) => theme.palette.text.primary};
  input {
    color: ${({ theme }) => theme.palette.text.primary};
  }
  p,
  label {
    color: ${({ theme }) => theme.palette.text.secondary};
  }
`;

const getValidIconPath = (iconPath?: string | null): string => {
  if (typeof iconPath === 'string') {
    return `file:///${iconPath}`;
  }
  return defaultIcon;
};

const workspaceID = (window.meta as WindowMeta[WindowNames.editWorkspace]).workspaceID as string;
const wikiPictureExtensions = ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'tif', 'bmp', 'dib'];

export default function EditWorkspace(): JSX.Element {
  const { t } = useTranslation();
  const originalWorkspace = useWorkspaceObservable(workspaceID);
  // DEBUG: console originalWorkspace
  console.log(`originalWorkspace`, originalWorkspace);
  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar();
  const [workspace, workspaceSetter, onSave] = useForm(originalWorkspace, requestRestartCountDown);
  const {
    backupOnInterval,
    disableAudio,
    disableNotifications,
    gitUrl,
    hibernateWhenUnused,
    homeUrl,
    isSubWiki,
    mainWikiToLink,
    name,
    order,
    picturePath,
    port,
    storageService,
    syncOnInterval,
    syncOnStartup,
    tagName,
    tokenAuth,
    transparentBackground,
    userName,
    lastUrl,
    wikiFolderLocation,
    rootTiddler,
    readOnlyMode,
    id,
  } = (workspace ?? {}) as unknown as IWorkspace;
  const fileSystemPaths = usePromiseValue<ISubWikiPluginContent[]>(
    async () => (mainWikiToLink ? await window.service.wiki.getSubWikiPluginContent(mainWikiToLink) : []),
    [],
    [mainWikiToLink],
  ) as ISubWikiPluginContent[];
  const fallbackUserName = usePromiseValue<string>(async () => (await window.service.auth.get('userName')) as string, '');
  // some feature need a username to work, so if userName is empty, assign a fallbackUserName DEFAULT_USER_NAME
  const userNameIsEmpty = !(userName || fallbackUserName);
  const authToken = usePromiseValue<string | undefined>(
    async () => await (window.service.auth.getOneTimeAdminAuthTokenForWorkspace(id)),
    '',
    [id],
  );
  const rememberLastPageVisited = usePromiseValue(async () => await window.service.preference.get('rememberLastPageVisited'));
  const actualIP = useActualIp(homeUrl);
  if (workspaceID === undefined) {
    return <Root>Error {workspaceID ?? '-'} not exists</Root>;
  }
  if (workspace === undefined) {
    return <Root>{t('Loading')}</Root>;
  }
  const isCreateSyncedWorkspace = storageService !== SupportedStorageServices.local;
  return (
    <Root>
      <div id='test' data-usage='For spectron automating testing' />
      {RestartSnackbar}
      <Helmet>
        <title>
          {t('WorkspaceSelector.EditWorkspace')} {String(order ?? 1)} {name}
        </title>
      </Helmet>
      <FlexGrow>
        <TextField
          id='outlined-full-width'
          label={t('EditWorkspace.Name')}
          helperText={t('EditWorkspace.NameDescription')}
          placeholder='Optional'
          value={name}
          onChange={(event) => {
            workspaceSetter({ ...workspace, name: event.target.value });
          }}
        />
        <TextField
          id='outlined-full-width'
          label={t('EditWorkspace.Path')}
          helperText={t('EditWorkspace.PathDescription')}
          placeholder='Optional'
          disabled
          value={wikiFolderLocation}
          onChange={(event) => {
            workspaceSetter({ ...workspace, wikiFolderLocation: event.target.value });
          }}
        />
        <TextField
          helperText={t('AddWorkspace.WorkspaceUserNameDetail')}
          fullWidth
          onChange={(event) => {
            workspaceSetter({ ...workspace, userName: event.target.value }, true);
          }}
          label={t('AddWorkspace.WorkspaceUserName')}
          placeholder={fallbackUserName}
          value={userName}
        />
        <Divider />
        {!isSubWiki && (
          <>
            <TextField
              id='outlined-full-width'
              label={t('EditWorkspace.Port')}
              helperText={
                <span>
                  {t('EditWorkspace.URL')}{' '}
                  <Link
                    onClick={async () => {
                      actualIP && (await window.service.native.open(actualIP));
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {actualIP}
                  </Link>
                </span>
              }
              placeholder='Optional'
              value={port}
              onChange={async (event) => {
                if (!Number.isNaN(Number.parseInt(event.target.value))) {
                  workspaceSetter({
                    ...workspace,
                    port: Number(event.target.value),
                    homeUrl: await window.service.native.getLocalHostUrlWithActualIP(`http://${defaultServerIP}:${event.target.value}/`),
                  }, true);
                }
              }}
            />
            <Divider />
            <List>
              <ListItem disableGutters>
                <ListItemText primary={t('EditWorkspace.ReadOnlyMode')} secondary={t('EditWorkspace.ReadOnlyModeDescription')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={readOnlyMode}
                    onChange={(event) => {
                      workspaceSetter({ ...workspace, readOnlyMode: event.target.checked, tokenAuth: event.target.checked ? false : tokenAuth }, true);
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              <ListItem disableGutters>
                <ListItemText
                  primary={t('EditWorkspace.TokenAuth')}
                  secondary={
                    <>
                      <div>{t('EditWorkspace.TokenAuthDescription')}</div>
                      {(userNameIsEmpty || !fallbackUserName) && <div>{t('EditWorkspace.TokenAuthAutoFillUserNameDescription')}</div>}
                      <div>
                        {tokenAuth && (
                          <ListItemText
                            primary={t('EditWorkspace.TokenAuthCurrentHeader')}
                            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                            secondary={`"${getTidGiAuthHeaderWithToken(authToken ?? '')}": "${userName || fallbackUserName || ''}"`}
                          />
                        )}
                      </div>
                    </>
                  }
                />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={tokenAuth}
                    onChange={(event) => {
                      if (userNameIsEmpty) {
                        workspaceSetter({
                          ...workspace,
                          userName: DEFAULT_USER_NAME,
                        });
                      }
                      workspaceSetter({
                        ...workspace,
                        tokenAuth: event.target.checked,
                        readOnlyMode: event.target.checked ? false : readOnlyMode,
                      }, true);
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              <Divider />
            </List>
            {rememberLastPageVisited && (
              <TextField
                id='outlined-full-width'
                label={t('EditWorkspace.LastVisitState')}
                helperText={t('Preference.RememberLastVisitState')}
                placeholder={actualIP}
                value={lastUrl}
                onChange={(event) => {
                  workspaceSetter({
                    ...workspace,
                    lastUrl: (event.target.value || actualIP) ?? '',
                  });
                }}
              />
            )}
          </>
        )}
        {isSubWiki && (
          <Autocomplete
            freeSolo
            options={fileSystemPaths?.map((fileSystemPath) => fileSystemPath.tagName)}
            value={tagName}
            onInputChange={(_, value) => {
              workspaceSetter({ ...workspace, tagName: value }, true);
            }}
            renderInput={(parameters) => <TextField {...parameters} label={t('AddWorkspace.TagName')} helperText={t('AddWorkspace.TagNameHelp')} />}
          />
        )}
        <AvatarFlex>
          <AvatarLeft>
            <Avatar transparentBackground={transparentBackground}>
              <AvatarPicture alt='Icon' src={getValidIconPath(picturePath)} />
            </Avatar>
          </AvatarLeft>
          <AvatarRight>
            <Tooltip title={wikiPictureExtensions.join(', ')} placement='top'>
              <PictureButton
                variant='outlined'
                size='small'
                onClick={async () => {
                  const filePaths = await window.service.native.pickFile([{ name: 'Images', extensions: wikiPictureExtensions }]);
                  if (filePaths.length > 0) {
                    await window.service.workspace.update(workspaceID, { picturePath: filePaths[0] });
                  }
                }}
              >
                {t('EditWorkspace.SelectLocal')}
              </PictureButton>
            </Tooltip>

            <Tooltip title={t('EditWorkspace.NoRevert') ?? ''} placement='bottom'>
              <PictureButton
                onClick={() => {
                  workspaceSetter({ ...workspace, picturePath: null });
                }}
                disabled={!picturePath}
              >
                {t('EditWorkspace.ResetDefaultIcon')}
              </PictureButton>
            </Tooltip>
          </AvatarRight>
        </AvatarFlex>
        <SyncedWikiDescription
          isCreateSyncedWorkspace={isCreateSyncedWorkspace}
          isCreateSyncedWorkspaceSetter={(isSynced: boolean) => {
            workspaceSetter({ ...workspace, storageService: isSynced ? SupportedStorageServices.github : SupportedStorageServices.local });
            // requestRestartCountDown();
          }}
        />
        {isCreateSyncedWorkspace && (
          <TokenForm
            storageProvider={storageService}
            storageProviderSetter={(nextStorageService: SupportedStorageServices) => {
              workspaceSetter({ ...workspace, storageService: nextStorageService });
              // requestRestartCountDown();
            }}
          />
        )}
        {storageService !== SupportedStorageServices.local && (
          <GitRepoUrlForm
            storageProvider={storageService}
            gitRepoUrl={gitUrl ?? ''}
            gitRepoUrlSetter={(nextGitUrl: string) => {
              workspaceSetter({ ...workspace, gitUrl: nextGitUrl });
            }}
            isCreateMainWorkspace={!isSubWiki}
          />
        )}
        {storageService !== SupportedStorageServices.local && (
          <>
            <List>
              <ListItem disableGutters>
                <ListItemText primary={t('EditWorkspace.SyncOnInterval')} secondary={t('EditWorkspace.SyncOnIntervalDescription')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={syncOnInterval}
                    onChange={(event) => {
                      workspaceSetter({ ...workspace, syncOnInterval: event.target.checked });
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              <ListItem disableGutters>
                <ListItemText primary={t('EditWorkspace.SyncOnStartup')} secondary={t('EditWorkspace.SyncOnStartupDescription')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={syncOnStartup}
                    onChange={(event) => {
                      workspaceSetter({ ...workspace, syncOnStartup: event.target.checked });
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </>
        )}
        {storageService === SupportedStorageServices.local && (
          <>
            <List>
              <Divider />
              <ListItem disableGutters>
                <ListItemText primary={t('EditWorkspace.BackupOnInterval')} secondary={t('EditWorkspace.BackupOnIntervalDescription')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge='end'
                    color='primary'
                    checked={backupOnInterval}
                    onChange={(event) => {
                      workspaceSetter({ ...workspace, backupOnInterval: event.target.checked });
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </>
        )}
        {!isSubWiki && (
          <Autocomplete
            freeSolo
            options={rootTiddlers}
            value={rootTiddler}
            defaultValue={rootTiddlers[0]}
            onInputChange={(_, value) => {
              workspaceSetter({ ...workspace, rootTiddler: value });
              // void requestSaveAndRestart();
            }}
            renderInput={(parameters) => <TextField {...parameters} label={t('EditWorkspace.WikiRootTiddler')} helperText={t('EditWorkspace.WikiRootTiddlerDescription')} />}
          />
        )}
        {!isSubWiki && (
          <List>
            <Divider />
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.HibernateTitle')} secondary={t('EditWorkspace.HibernateDescription')} />
              <ListItemSecondaryAction>
                <Switch
                  edge='end'
                  color='primary'
                  checked={hibernateWhenUnused}
                  onChange={(event) => {
                    workspaceSetter({ ...workspace, hibernateWhenUnused: event.target.checked });
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.DisableNotificationTitle')} secondary={t('EditWorkspace.DisableNotification')} />
              <ListItemSecondaryAction>
                <Switch
                  edge='end'
                  color='primary'
                  checked={disableNotifications}
                  onChange={(event) => {
                    workspaceSetter({ ...workspace, disableNotifications: event.target.checked });
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.DisableAudioTitle')} secondary={t('EditWorkspace.DisableAudio')} />
              <ListItemSecondaryAction>
                <Switch
                  edge='end'
                  color='primary'
                  checked={disableAudio}
                  onChange={(event) => {
                    workspaceSetter({ ...workspace, disableAudio: event.target.checked });
                  }}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        )}
      </FlexGrow>
      {!isEqual(workspace, originalWorkspace) && (
        <SaveCancelButtonsContainer>
          <Button color='primary' variant='contained' disableElevation onClick={onSave}>
            {t('EditWorkspace.Save')}
          </Button>
          <Button variant='contained' disableElevation onClick={() => void window.remote.closeCurrentWindow()}>
            {t('EditWorkspace.Cancel')}
          </Button>
        </SaveCancelButtonsContainer>
      )}
    </Root>
  );
}
