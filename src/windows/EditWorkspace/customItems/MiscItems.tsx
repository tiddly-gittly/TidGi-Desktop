import { Switch } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { ListItemText } from '@/components/ListItem';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { ListItemVertical, TextField } from '../../Preferences/PreferenceComponents';
import { useWorkspaceForm } from '../WorkspaceFormContext';

export function LastUrlItem(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const preference = usePreferenceObservable();

  if (!isWikiWorkspace(workspace)) return null;
  if (workspace.isSubWiki) return null;

  const rememberLastPageVisited = preference?.rememberLastPageVisited;

  return (
    <ListItemVertical>
      <ListItemText primary={t('EditWorkspace.LastVisitState')} secondary={t('Preference.RememberLastVisitState')} />
      <Switch
        edge='end'
        color='primary'
        checked={rememberLastPageVisited ?? false}
        data-testid='remember-last-page-visited-switch'
        onChange={(event) => {
          void window.service.preference.set('rememberLastPageVisited', event.target.checked);
        }}
      />
      {rememberLastPageVisited === true && (
        <TextField
          fullWidth
          placeholder={workspace.homeUrl}
          value={workspace.lastUrl ?? ''}
          onChange={(event) => {
            workspaceSetter({ ...workspace, lastUrl: event.target.value || workspace.homeUrl || '' });
          }}
        />
      )}
    </ListItemVertical>
  );
}
