import { Button, Tooltip } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { TokenForm } from '@/components/TokenForm';
import { SupportedStorageServices } from '@services/types';
import { isWikiWorkspace, wikiWorkspaceDefaultValues } from '@services/workspaces/interface';
import { SyncedWikiDescription } from '../../AddWorkspace/Description';
import { GitRepoUrlForm } from '../../AddWorkspace/GitRepoUrlForm';
import { ListItemVertical, TextField } from '../../Preferences/PreferenceComponents';
import { useWorkspaceForm } from '../WorkspaceFormContext';

export function WorkspacePathItem(): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace } = useWorkspaceForm();
  const wikiFolderLocation = isWikiWorkspace(workspace) ? workspace.wikiFolderLocation : '';
  return (
    <ListItemVertical>
      <ListItemText primary={t('EditWorkspace.Path')} secondary={t('EditWorkspace.PathDescription')} />
      <TextField
        fullWidth
        placeholder='Optional'
        disabled
        value={wikiFolderLocation}
      />
      <Tooltip title={t('EditWorkspace.MoveWorkspaceTooltip') ?? ''} placement='top'>
        <Button
          variant='outlined'
          size='small'
          sx={{ mt: 1 }}
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
    </ListItemVertical>
  );
}

export function StorageServiceSwitchItem(): React.JSX.Element | null {
  const { workspace, workspaceSetter } = useWorkspaceForm();
  if (!isWikiWorkspace(workspace)) return null;
  const storageService = workspace.storageService ?? wikiWorkspaceDefaultValues.storageService;
  const isCreateSyncedWorkspace = storageService !== SupportedStorageServices.local;
  return (
    <ListItem>
      <SyncedWikiDescription
        isCreateSyncedWorkspace={isCreateSyncedWorkspace}
        isCreateSyncedWorkspaceSetter={(isSynced: boolean) => {
          workspaceSetter({ ...workspace, storageService: isSynced ? SupportedStorageServices.github : SupportedStorageServices.local });
        }}
      />
    </ListItem>
  );
}

export function TokenFormItem(): React.JSX.Element | null {
  const { workspace, workspaceSetter } = useWorkspaceForm();
  if (!isWikiWorkspace(workspace)) return null;
  const storageService = workspace.storageService ?? wikiWorkspaceDefaultValues.storageService;
  if (storageService === SupportedStorageServices.local) return null;
  return (
    <ListItem>
      <TokenForm
        storageProvider={storageService}
        storageProviderSetter={(nextStorageService) => {
          workspaceSetter({ ...workspace, storageService: nextStorageService });
        }}
      />
    </ListItem>
  );
}

export function GitRepoUrlItem(): React.JSX.Element | null {
  const { workspace, workspaceSetter } = useWorkspaceForm();
  if (!isWikiWorkspace(workspace)) return null;
  const storageService = workspace.storageService ?? wikiWorkspaceDefaultValues.storageService;
  if (storageService === SupportedStorageServices.local) return null;
  return (
    <ListItem>
      <GitRepoUrlForm
        storageProvider={storageService}
        gitRepoUrl={workspace.gitUrl ?? ''}
        gitRepoUrlSetter={(nextGitUrl: string) => {
          workspaceSetter({ ...workspace, gitUrl: nextGitUrl });
        }}
        isCreateMainWorkspace={!workspace.isSubWiki}
      />
    </ListItem>
  );
}
