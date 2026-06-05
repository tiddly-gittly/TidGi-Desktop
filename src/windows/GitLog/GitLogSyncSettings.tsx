import { Button, Divider, List, styled } from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem } from '@/components/ListItem';
import { TokenForm } from '@/components/TokenForm';
import { SupportedStorageServices } from '@services/types';
import { type IWikiWorkspace } from '@services/workspaces/interface';
import { GitRepoUrlForm } from '../AddWorkspace/GitRepoUrlForm';
import { SyncedWikiDescription } from '../AddWorkspace/Description';

const SettingsContainer = styled('div')`
  padding: 16px;
  overflow-y: auto;
  height: 100%;
`;

interface IGitLogSyncSettingsProps {
  workspace: IWikiWorkspace;
  onSaved?: () => void;
}

export function GitLogSyncSettings({ workspace, onSaved }: IGitLogSyncSettingsProps): React.JSX.Element {
  const { t } = useTranslation();
  const [storageService, setStorageService] = useState(workspace.storageService);
  const [gitUrl, setGitUrl] = useState(workspace.gitUrl ?? '');

  useEffect(() => {
    setStorageService(workspace.storageService);
    setGitUrl(workspace.gitUrl ?? '');
  }, [workspace.storageService, workspace.gitUrl]);

  const handleSave = useCallback(async () => {
    await window.service.workspace.update(workspace.id, {
      storageService,
      gitUrl,
    });
    onSaved?.();
  }, [workspace.id, storageService, gitUrl, onSaved]);

  const isSyncedWorkspace = storageService !== SupportedStorageServices.local;

  return (
    <SettingsContainer>
      <List dense>
        <ListItem>
          <SyncedWikiDescription
            isCreateSyncedWorkspace={isSyncedWorkspace}
            isCreateSyncedWorkspaceSetter={(isSynced) => {
              setStorageService(isSynced ? SupportedStorageServices.github : SupportedStorageServices.local);
            }}
          />
        </ListItem>

        {isSyncedWorkspace && (
          <>
            <Divider sx={{ my: 1 }} />
            <ListItem>
              <TokenForm
                storageProvider={storageService}
                storageProviderSetter={setStorageService}
              />
            </ListItem>
            <Divider sx={{ my: 1 }} />
            <ListItem>
              <GitRepoUrlForm
                storageProvider={storageService}
                gitRepoUrl={gitUrl}
                gitRepoUrlSetter={setGitUrl}
                isCreateMainWorkspace={!workspace.isSubWiki}
              />
            </ListItem>
          </>
        )}
      </List>

      <Button variant='contained' onClick={handleSave} fullWidth sx={{ mt: 2 }}>
        {t('EditWorkspace.Save')}
      </Button>
    </SettingsContainer>
  );
}
