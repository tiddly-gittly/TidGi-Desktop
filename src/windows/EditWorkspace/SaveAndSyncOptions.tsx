import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AccordionDetails, Button, Divider, List, ListItem, ListItemText, Switch, Tooltip } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { TokenForm } from '@/components/TokenForm';
import { SupportedStorageServices } from '@services/types';
import { isWikiWorkspace, IWorkspace, wikiWorkspaceDefaultValues } from '@services/workspaces/interface';
import { SyncedWikiDescription } from '../AddWorkspace/Description';
import { GitRepoUrlForm } from '../AddWorkspace/GitRepoUrlForm';
import { OptionsAccordion, OptionsAccordionSummary, TextField } from './styles';

interface SaveAndSyncOptionsProps {
  workspace: IWorkspace;
  workspaceSetter: (newValue: IWorkspace, requestSaveAndRestart?: boolean) => void;
  rememberLastPageVisited: boolean | undefined;
}

export function SaveAndSyncOptions(props: SaveAndSyncOptionsProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter, rememberLastPageVisited: _rememberLastPageVisited } = props;

  const isWiki = isWikiWorkspace(workspace);
  const {
    gitUrl = null,
    homeUrl: _homeUrl = '',
    isSubWiki = false,
    lastUrl: _lastUrl = null,
    storageService = wikiWorkspaceDefaultValues.storageService,
    syncOnInterval = false,
    syncOnStartup = false,
    backupOnInterval = wikiWorkspaceDefaultValues.backupOnInterval,
    userName = '',
    wikiFolderLocation = '',
  } = isWiki ? workspace : {
    gitUrl: null,
    homeUrl: '',
    isSubWiki: false,
    lastUrl: null,
    storageService: wikiWorkspaceDefaultValues.storageService,
    syncOnInterval: false,
    syncOnStartup: false,
    backupOnInterval: wikiWorkspaceDefaultValues.backupOnInterval,
    userName: '',
    wikiFolderLocation: '',
  };

  const fallbackUserName = '';
  const isCreateSyncedWorkspace = storageService !== SupportedStorageServices.local;

  return (
    <OptionsAccordion>
      <Tooltip title={t('EditWorkspace.ClickToExpand')}>
        <OptionsAccordionSummary expandIcon={<ExpandMoreIcon />} data-testid='preference-section-saveAndSyncOptions'>
          {t('EditWorkspace.SaveAndSyncOptions')}
        </OptionsAccordionSummary>
      </Tooltip>
      <AccordionDetails>
        <TextField
          fullWidth
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
        <Tooltip title={t('EditWorkspace.MoveWorkspaceTooltip') ?? ''} placement='top'>
          <Button
            variant='outlined'
            size='small'
            onClick={async () => {
              const directories = await window.service.native.pickDirectory();
              if (directories.length > 0) {
                const newLocation = directories[0];
                try {
                  await window.service.wikiGitWorkspace.moveWorkspaceLocation(workspace.id, newLocation);
                } catch (error) {
                  const errorMessage = (error as Error).message;
                  void window.service.native.log('error', `Failed to move workspace: ${errorMessage}`, { error, workspaceID: workspace.id, newLocation });
                  void window.service.notification.show({
                    title: t('EditWorkspace.MoveWorkspaceFailed'),
                    body: t('EditWorkspace.MoveWorkspaceFailedMessage', { name: workspace.name, error: errorMessage }),
                  });
                }
              }
            }}
          >
            {t('EditWorkspace.MoveWorkspace')}
          </Button>
        </Tooltip>
        {isSubWiki && workspace && isWikiWorkspace(workspace) && workspace.mainWikiToLink && (
          <TextField
            fullWidth
            id='outlined-full-width'
            label={t('EditWorkspace.MainWorkspacePath')}
            helperText={t('EditWorkspace.PathDescription')}
            value={workspace.mainWikiToLink}
            disabled
          />
        )}
        {!isSubWiki && (
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
        )}
        <Divider />
        <SyncedWikiDescription
          isCreateSyncedWorkspace={isCreateSyncedWorkspace}
          isCreateSyncedWorkspaceSetter={(isSynced: boolean) => {
            workspaceSetter({ ...workspace, storageService: isSynced ? SupportedStorageServices.github : SupportedStorageServices.local });
          }}
        />
        {isCreateSyncedWorkspace && (
          <TokenForm
            storageProvider={storageService}
            storageProviderSetter={(nextStorageService) => {
              workspaceSetter({ ...workspace, storageService: nextStorageService });
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
  );
}
