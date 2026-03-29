import React from 'react';
import { useTranslation } from 'react-i18next';

import { ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { ListItemVertical, TextField } from '../../Preferences/PreferenceComponents';
import { useWorkspaceForm } from '../WorkspaceFormContext';

export function LastUrlItem(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const rememberLastPageVisited = usePromiseValue(async () => await window.service.preference.get('rememberLastPageVisited'));

  if (!isWikiWorkspace(workspace)) return null;
  if (workspace.isSubWiki) return null;
  if (!rememberLastPageVisited) return null;

  return (
    <ListItemVertical>
      <ListItemText primary={t('EditWorkspace.LastVisitState')} secondary={t('Preference.RememberLastVisitState')} />
      <TextField
        fullWidth
        placeholder={workspace.homeUrl}
        value={workspace.lastUrl ?? ''}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          workspaceSetter({ ...workspace, lastUrl: (event.target.value || workspace.homeUrl) ?? '' });
        }}
      />
    </ListItemVertical>
  );
}
