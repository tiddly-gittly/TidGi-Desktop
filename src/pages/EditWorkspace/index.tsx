/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable unicorn/no-useless-undefined */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable unicorn/no-null */
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Autocomplete } from '@mui/lab';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  AutocompleteRenderInputParams,
  Button as ButtonRaw,
  Divider,
  Paper,
  Switch,
  TextField as TextFieldRaw,
  Tooltip,
  Typography,
} from '@mui/material';
import React from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { css, styled } from 'styled-components';
import defaultIcon from '../../images/default-icon.png';

import { usePromiseValue } from '@/helpers/useServiceValue';
import type { ISubWikiPluginContent } from '@services/wiki/plugin/subWikiPlugin';
import { WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { useWorkspaceObservable } from '@services/workspaces/hooks';
import { useForm } from './useForm';

import { List, ListItem, ListItemText } from '@/components/ListItem';
import { RestartSnackbarType, useRestartSnackbar } from '@/components/RestartSnackbar';
import { TokenForm } from '@/components/TokenForm';
import { wikiPictureExtensions } from '@/constants/fileNames';
import { SupportedStorageServices } from '@services/types';
import { nonConfigFields } from '@services/workspaces/interface';
import { isEqual, omit } from 'lodash';
import { SyncedWikiDescription } from '../AddWorkspace/Description';
import { GitRepoUrlForm } from '../AddWorkspace/GitRepoUrlForm';
import { ServerOptions } from './server';

const OptionsAccordion = styled(Accordion)`
  box-shadow: unset;
  background-color: unset;
`;
const OptionsAccordionSummary = styled(AccordionSummary)`
  padding: 0;
  flex-direction: row-reverse;
`;
const Root = styled(Paper)`
  height: 100%;
  width: 100%;
  padding: 20px;
  /** for SaveCancelButtonsContainer 's height */
  margin-bottom: 40px;
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

const getValidIconPath = (iconPath?: string | null): string => {
  if (typeof iconPath === 'string') {
    return `file:///${iconPath}`;
  }
  return defaultIcon;
};

const workspaceID = (window.meta() as WindowMeta[WindowNames.editWorkspace]).workspaceID!;

export default function EditWorkspace(): React.JSX.Element {
  const { t } = useTranslation();
  const originalWorkspace = useWorkspaceObservable(workspaceID);
  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar({ waitBeforeCountDown: 0, workspace: originalWorkspace, restartType: RestartSnackbarType.Wiki });
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
    storageService,
    syncOnInterval,
    syncOnStartup,
    tagName,
    transparentBackground,
    userName,
    lastUrl,
    wikiFolderLocation,
  } = workspace ?? {};
  const fileSystemPaths = usePromiseValue<ISubWikiPluginContent[]>(
    async () => (mainWikiToLink ? await window.service.wiki.getSubWikiPluginContent(mainWikiToLink) : []),
    [],
    [mainWikiToLink],
  )!;
  const fallbackUserName = usePromiseValue<string>(async () => (await window.service.auth.get('userName'))!, '');

  const rememberLastPageVisited = usePromiseValue(async () => await window.service.preference.get('rememberLastPageVisited'));
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
        {!isSubWiki && (
          <>
            <Divider />
            <ServerOptions workspace={workspace} workspaceSetter={workspaceSetter} />
            <Divider />
          </>
        )}
        <OptionsAccordion defaultExpanded>
          <Tooltip title={t('EditWorkspace.ClickToExpand')}>
            <OptionsAccordionSummary expandIcon={<ExpandMoreIcon />}>
              {t('EditWorkspace.AppearanceOptions')}
            </OptionsAccordionSummary>
          </Tooltip>
          <AccordionDetails>
            <TextField
              id='outlined-full-width'
              label={t('EditWorkspace.Name')}
              helperText={t('EditWorkspace.NameDescription')}
              placeholder='Optional'
              value={name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                workspaceSetter({ ...workspace, name: event.target.value });
              }}
            />
            <Divider />
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
                        workspaceSetter({ ...workspace, picturePath: filePaths[0] });
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
          </AccordionDetails>
        </OptionsAccordion>
        <OptionsAccordion>
          <Tooltip title={t('EditWorkspace.ClickToExpand')}>
            <OptionsAccordionSummary expandIcon={<ExpandMoreIcon />}>
              {t('EditWorkspace.SaveAndSyncOptions')}
            </OptionsAccordionSummary>
          </Tooltip>
          <AccordionDetails>
            <TextField
              id='outlined-full-width'
              label={t('EditWorkspace.Path')}
              helperText={t('EditWorkspace.PathDescription')}
              placeholder='Optional'
              disabled
              value={wikiFolderLocation}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                workspaceSetter({ ...workspace, wikiFolderLocation: event.target.value });
              }}
            />
            {isSubWiki && mainWikiToLink && (
              <TextField
                id='outlined-full-width'
                label={t('EditWorkspace.MainWorkspacePath')}
                helperText={t('EditWorkspace.PathDescription')}
                value={mainWikiToLink}
                disabled
              />
            )}
            <TextField
              helperText={t('AddWorkspace.WorkspaceUserNameDetail')}
              fullWidth
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                workspaceSetter({ ...workspace, userName: event.target.value }, true);
              }}
              label={t('AddWorkspace.WorkspaceUserName')}
              placeholder={fallbackUserName}
              value={userName}
            />
            <Divider />
            {isSubWiki && (
              <Autocomplete
                freeSolo
                options={fileSystemPaths?.map((fileSystemPath) => fileSystemPath.tagName)}
                value={tagName}
                onInputChange={(event: React.SyntheticEvent, value: string) => {
                  workspaceSetter({ ...workspace, tagName: value }, true);
                }}
                renderInput={(parameters: AutocompleteRenderInputParams) => (
                  <TextField {...parameters} label={t('AddWorkspace.TagName')} helperText={t('AddWorkspace.TagNameHelp')} />
                )}
              />
            )}
            <SyncedWikiDescription
              isCreateSyncedWorkspace={isCreateSyncedWorkspace}
              isCreateSyncedWorkspaceSetter={(isSynced: boolean) => {
                workspaceSetter({ ...workspace, storageService: isSynced ? SupportedStorageServices.github : SupportedStorageServices.local });
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
                  <ListItem
                    disableGutters
                    secondaryAction={
                      <Switch
                        edge='end'
                        color='primary'
                        checked={syncOnInterval}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                          workspaceSetter({ ...workspace, syncOnInterval: event.target.checked });
                        }}
                      />
                    }
                  >
                    <ListItemText primary={t('EditWorkspace.SyncOnInterval')} secondary={t('EditWorkspace.SyncOnIntervalDescription')} />
                  </ListItem>
                  <ListItem
                    disableGutters
                    secondaryAction={
                      <Switch
                        edge='end'
                        color='primary'
                        checked={syncOnStartup}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                          workspaceSetter({ ...workspace, syncOnStartup: event.target.checked });
                        }}
                      />
                    }
                  >
                    <ListItemText primary={t('EditWorkspace.SyncOnStartup')} secondary={t('EditWorkspace.SyncOnStartupDescription')} />
                  </ListItem>
                </List>
              </>
            )}
            {storageService === SupportedStorageServices.local && (
              <>
                <List>
                  <Divider />
                  <ListItem
                    disableGutters
                    secondaryAction={
                      <Switch
                        edge='end'
                        color='primary'
                        checked={backupOnInterval}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                          workspaceSetter({ ...workspace, backupOnInterval: event.target.checked });
                        }}
                      />
                    }
                  >
                    <ListItemText primary={t('EditWorkspace.BackupOnInterval')} secondary={t('EditWorkspace.BackupOnIntervalDescription')} />
                  </ListItem>
                </List>
              </>
            )}
          </AccordionDetails>
        </OptionsAccordion>
        <OptionsAccordion>
          <Tooltip title={t('EditWorkspace.ClickToExpand')}>
            <OptionsAccordionSummary expandIcon={<ExpandMoreIcon />}>
              {t('EditWorkspace.MiscOptions')}
            </OptionsAccordionSummary>
          </Tooltip>
          <AccordionDetails>
            {!isSubWiki && (
              <List>
                <Divider />
                <ListItem
                  disableGutters
                  secondaryAction={
                    <Switch
                      edge='end'
                      color='primary'
                      checked={hibernateWhenUnused}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                        workspaceSetter({ ...workspace, hibernateWhenUnused: event.target.checked });
                      }}
                    />
                  }
                >
                  <ListItemText primary={t('EditWorkspace.HibernateTitle')} secondary={t('EditWorkspace.HibernateDescription')} />
                </ListItem>
                <ListItem
                  disableGutters
                  secondaryAction={
                    <Switch
                      edge='end'
                      color='primary'
                      checked={disableNotifications}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                        workspaceSetter({ ...workspace, disableNotifications: event.target.checked });
                      }}
                    />
                  }
                >
                  <ListItemText primary={t('EditWorkspace.DisableNotificationTitle')} secondary={t('EditWorkspace.DisableNotification')} />
                </ListItem>
                <ListItem
                  disableGutters
                  secondaryAction={
                    <Switch
                      edge='end'
                      color='primary'
                      checked={disableAudio}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                        workspaceSetter({ ...workspace, disableAudio: event.target.checked });
                      }}
                    />
                  }
                >
                  <ListItemText primary={t('EditWorkspace.DisableAudioTitle')} secondary={t('EditWorkspace.DisableAudio')} />
                </ListItem>
              </List>
            )}
            {!isSubWiki && rememberLastPageVisited && (
              <TextField
                id='outlined-full-width'
                label={t('EditWorkspace.LastVisitState')}
                helperText={t('Preference.RememberLastVisitState')}
                placeholder={homeUrl}
                value={lastUrl}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  workspaceSetter({
                    ...workspace,
                    lastUrl: (event.target.value || homeUrl) ?? '',
                  });
                }}
              />
            )}
          </AccordionDetails>
        </OptionsAccordion>
      </FlexGrow>
      {!isEqual(omit(workspace, nonConfigFields), omit(originalWorkspace, nonConfigFields)) && (
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
