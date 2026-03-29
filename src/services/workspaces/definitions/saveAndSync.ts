import CloudSyncIcon from '@mui/icons-material/CloudSync';
import type { IGenericSectionDefinition } from '@services/preferences/definitions/types';

export const saveAndSyncSection: IGenericSectionDefinition = {
  id: 'saveAndSync',
  titleKey: 'EditWorkspace.SaveAndSyncOptions',
  Icon: CloudSyncIcon,
  items: [
    {
      type: 'custom',
      componentId: 'workspace.path',
      titleKey: 'EditWorkspace.Path',
    },
    {
      type: 'preference-string',
      key: 'userName',
      titleKey: 'AddWorkspace.WorkspaceUserName',
      descriptionKey: 'AddWorkspace.WorkspaceUserNameDetail',
      needsRestart: true,
    },
    { type: 'divider' },
    {
      type: 'custom',
      componentId: 'workspace.storageServiceSwitch',
      titleKey: 'AddWorkspace.SyncedWiki',
    },
    {
      type: 'custom',
      componentId: 'workspace.tokenForm',
      titleKey: 'AddWorkspace.LoginToStorageProvider',
    },
    {
      type: 'custom',
      componentId: 'workspace.gitRepoUrl',
      titleKey: 'AddWorkspace.GitRepoUrl',
    },
    {
      type: 'preference-boolean',
      key: 'syncOnInterval',
      titleKey: 'EditWorkspace.SyncOnInterval',
      descriptionKey: 'EditWorkspace.SyncOnIntervalDescription',
    },
    {
      type: 'preference-boolean',
      key: 'syncOnStartup',
      titleKey: 'EditWorkspace.SyncOnStartup',
      descriptionKey: 'EditWorkspace.SyncOnStartupDescription',
    },
    {
      type: 'preference-boolean',
      key: 'syncSubWikis',
      titleKey: 'EditWorkspace.SyncSubWikis',
      descriptionKey: 'EditWorkspace.SyncSubWikisDescription',
    },
    {
      type: 'preference-boolean',
      key: 'backupOnInterval',
      titleKey: 'EditWorkspace.BackupOnInterval',
      descriptionKey: 'EditWorkspace.BackupOnIntervalDescription',
    },
  ],
};
