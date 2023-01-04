/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable unicorn/no-useless-undefined */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable unicorn/no-null */
import React, { useCallback } from 'react';
import styled, { css } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet';
import {
  Tooltip,
  Button as ButtonRaw,
  TextField as TextFieldRaw,
  Divider,
  List as ListRaw,
  ListItem as ListItemRaw,
  ListItemText as ListItemTextRaw,
  ListItemSecondaryAction,
  Switch,
  Typography,
  Link,
  Paper,
} from '@material-ui/core';
import { Autocomplete } from '@material-ui/lab';
import defaultIcon from '../../images/default-icon.png';

import type { ISubWikiPluginContent } from '@services/wiki/plugin/subWikiPlugin';
import { WindowNames, WindowMeta } from '@services/windows/WindowProperties';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { useWorkspaceObservable } from '@services/workspaces/hooks';
import { useForm } from './useForm';
import { IWorkspace } from '@services/workspaces/interface';

import { useRestartSnackbar } from '@/components/RestartSnackbar';
import { defaultServerIP } from '@/constants/urls';
import { SupportedStorageServices } from '@services/types';
import { SyncedWikiDescription } from '../AddWorkspace/Description';
import { TokenForm } from '@/components/TokenForm';
import { GitRepoUrlForm } from '../AddWorkspace/GitRepoUrlForm';
import { isEqual } from 'lodash';
import { useActualIp } from '@services/native/hooks';

const Root = styled(Paper)`
  height: 100%;
  width: 100%;
  padding: 20px;
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
 * */
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
  const [workspace, workspaceSetter, onSave] = useForm(originalWorkspace);
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
    transparentBackground,
    userName,
    lastUrl,
    wikiFolderLocation,
  } = (workspace ?? {}) as unknown as IWorkspace;
  const fileSystemPaths = usePromiseValue<ISubWikiPluginContent[]>(
    async () => (mainWikiToLink ? await window.service.wiki.getSubWikiPluginContent(mainWikiToLink) : []),
    [],
    [mainWikiToLink],
  ) as ISubWikiPluginContent[];
  const fallbackUserName = usePromiseValue<string>(async () => (await window.service.auth.get('userName')) as string, '');
  const rememberLastPageVisited = usePromiseValue(async () => await window.service.preference.get('rememberLastPageVisited'));

  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar();
  const requestSaveAndRestart = useCallback(async () => {
    if (!isEqual(workspace, originalWorkspace)) {
      await onSave();
      requestRestartCountDown();
    }
  }, [onSave, requestRestartCountDown, workspace, originalWorkspace]);

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
      <div id="test" data-usage="For spectron automating testing" />
      {RestartSnackbar}
      <Helmet>
        <title>
          {t('WorkspaceSelector.EditWorkspace')} {String(order ?? 1)} {name}
        </title>
      </Helmet>
      <FlexGrow>
        <TextField
          id="outlined-full-width"
          label={t('EditWorkspace.Name')}
          helperText={t('EditWorkspace.NameDescription')}
          placeholder="Optional"
          value={name}
          onChange={(event) => workspaceSetter({ ...workspace, name: event.target.value })}
        />
        <TextField
          id="outlined-full-width"
          label={t('EditWorkspace.Path')}
          helperText={t('EditWorkspace.PathDescription')}
          placeholder="Optional"
          disabled
          value={wikiFolderLocation}
          onChange={(event) => workspaceSetter({ ...workspace, wikiFolderLocation: event.target.value })}
        />
        <TextField
          helperText={t('AddWorkspace.WorkspaceUserNameDetail')}
          fullWidth
          onChange={(event) => {
            workspaceSetter({ ...workspace, userName: event.target.value });
            void requestSaveAndRestart();
          }}
          label={t('AddWorkspace.WorkspaceUserName')}
          placeholder={fallbackUserName}
          value={userName}
        />
        {!isSubWiki && (
          <>
            <TextField
              id="outlined-full-width"
              label={t('EditWorkspace.Port')}
              helperText={
                <span>
                  {t('EditWorkspace.URL')}{' '}
                  <Link onClick={async () => actualIP && (await window.service.native.open(actualIP))} style={{ cursor: 'pointer' }}>
                    {actualIP}
                  </Link>
                </span>
              }
              placeholder="Optional"
              value={port}
              onChange={async (event) => {
                if (!Number.isNaN(Number.parseInt(event.target.value))) {
                  workspaceSetter({
                    ...workspace,
                    port: Number(event.target.value),
                    homeUrl: await window.service.native.getLocalHostUrlWithActualIP(`http://${defaultServerIP}:${event.target.value}/`),
                  });
                  void requestSaveAndRestart();
                }
              }}
            />
            {rememberLastPageVisited && (
              <TextField
                id="outlined-full-width"
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
              workspaceSetter({ ...workspace, tagName: value });
              void requestSaveAndRestart();
            }}
            renderInput={(parameters) => <TextField {...parameters} label={t('AddWorkspace.TagName')} helperText={t('AddWorkspace.TagNameHelp')} />}
          />
        )}
        <AvatarFlex>
          <AvatarLeft>
            <Avatar transparentBackground={transparentBackground}>
              <AvatarPicture alt="Icon" src={getValidIconPath(picturePath)} />
            </Avatar>
          </AvatarLeft>
          <AvatarRight>
            <Tooltip title={wikiPictureExtensions.join(', ')} placement="top">
              <PictureButton
                variant="outlined"
                size="small"
                onClick={async () => {
                  const filePaths = await window.service.native.pickFile([{ name: 'Images', extensions: wikiPictureExtensions }]);
                  if (filePaths.length > 0) {
                    await window.service.workspace.update(workspaceID, { picturePath: filePaths[0] });
                  }
                }}>
                {t('EditWorkspace.SelectLocal')}
              </PictureButton>
            </Tooltip>

            <Tooltip title={t('EditWorkspace.NoRevert') ?? ''} placement="bottom">
              <PictureButton onClick={() => workspaceSetter({ ...workspace, picturePath: null })} disabled={!picturePath}>
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
            <Divider />
            <List>
              <ListItem disableGutters>
                <ListItemText primary={t('EditWorkspace.SyncOnInterval')} secondary={t('EditWorkspace.SyncOnIntervalDescription')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge="end"
                    color="primary"
                    checked={syncOnInterval}
                    onChange={(event) => workspaceSetter({ ...workspace, syncOnInterval: event.target.checked })}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              <ListItem disableGutters>
                <ListItemText primary={t('EditWorkspace.SyncOnStartup')} secondary={t('EditWorkspace.SyncOnStartupDescription')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge="end"
                    color="primary"
                    checked={syncOnStartup}
                    onChange={(event) => workspaceSetter({ ...workspace, syncOnStartup: event.target.checked })}
                  />
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </>
        )}
        {storageService === SupportedStorageServices.local && (
          <>
            <Divider />
            <List>
              <Divider />
              <ListItem disableGutters>
                <ListItemText primary={t('EditWorkspace.BackupOnInterval')} secondary={t('EditWorkspace.BackupOnIntervalDescription')} />
                <ListItemSecondaryAction>
                  <Switch
                    edge="end"
                    color="primary"
                    checked={backupOnInterval}
                    onChange={(event) => workspaceSetter({ ...workspace, backupOnInterval: event.target.checked })}
                  />
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </>
        )}
        {!isSubWiki && (
          <List>
            <Divider />
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.HibernateTitle')} secondary={t('EditWorkspace.HibernateDescription')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={hibernateWhenUnused}
                  onChange={(event) => workspaceSetter({ ...workspace, hibernateWhenUnused: event.target.checked })}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.DisableNotificationTitle')} secondary={t('EditWorkspace.DisableNotification')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={disableNotifications}
                  onChange={(event) => workspaceSetter({ ...workspace, disableNotifications: event.target.checked })}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem disableGutters>
              <ListItemText primary={t('EditWorkspace.DisableAudioTitle')} secondary={t('EditWorkspace.DisableAudio')} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  color="primary"
                  checked={disableAudio}
                  onChange={(event) => workspaceSetter({ ...workspace, disableAudio: event.target.checked })}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        )}
      </FlexGrow>
      {!isEqual(workspace, originalWorkspace) && (
        <div>
          <Button color="primary" variant="contained" disableElevation onClick={requestSaveAndRestart}>
            {t('EditWorkspace.Save')}
          </Button>
          <Button variant="contained" disableElevation onClick={() => void window.remote.closeCurrentWindow()}>
            {t('EditWorkspace.Cancel')}
          </Button>
        </div>
      )}
    </Root>
  );
}
