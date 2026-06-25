import { Switch } from '@mui/material';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { ListItemVertical, TextField } from '../../Preferences/PreferenceComponents';
import { useWorkspaceForm } from '../WorkspaceFormContext';

export function LastUrlItem(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const initialValue = usePromiseValue(async () => await window.service.preference.get('rememberLastPageVisited'));
  const [rememberLastPageVisited, setRememberLastPageVisited] = useState<boolean | undefined>(initialValue);

  // Sync local state when initialValue resolves
  React.useEffect(() => {
    if (initialValue !== undefined) {
      setRememberLastPageVisited(initialValue);
    }
  }, [initialValue]);

  const handleToggle = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setRememberLastPageVisited(checked);
    await window.service.preference.set('rememberLastPageVisited', checked);
  }, []);

  if (!isWikiWorkspace(workspace)) return null;
  if (workspace.isSubWiki) return null;

  return (
    <ListItemVertical>
      <ListItemText primary={t('EditWorkspace.LastVisitState')} secondary={t('Preference.RememberLastVisitState')} />
      <Switch
        edge='end'
        color='primary'
        checked={rememberLastPageVisited ?? false}
        data-testid='remember-last-page-visited-switch'
        onChange={handleToggle}
      />
      {rememberLastPageVisited && (
        <TextField
          fullWidth
          placeholder={workspace.homeUrl}
          value={workspace.lastUrl ?? ''}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            workspaceSetter({ ...workspace, lastUrl: (event.target.value || workspace.homeUrl) ?? '' });
          }}
        />
      )}
    </ListItemVertical>
  );
}
