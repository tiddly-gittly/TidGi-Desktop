import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import Paper from '@material-ui/core/Paper';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';

const Container = styled(Paper)`
  margin-top: 10px;
  padding: 10px;
`;

/**
 * Introduce difference between main and sub wiki.
 * @returns
 */
export function MainSubWikiDescription({
  isCreateMainWorkspace,
  isCreateMainWorkspaceSetter,
}: {
  isCreateMainWorkspace: boolean;
  isCreateMainWorkspaceSetter: (is: boolean) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const label = isCreateMainWorkspace ? t('AddWorkspace.MainWorkspace') : t('AddWorkspace.SubWorkspace');
  const description = isCreateMainWorkspace ? t('AddWorkspace.MainWorkspaceDescription') : t('AddWorkspace.SubWorkspaceDescription');
  return (
    <Container elevation={0} square>
      <FormControlLabel
        control={<Switch checked={isCreateMainWorkspace} onChange={(event) => isCreateMainWorkspaceSetter(event.target.checked)} />}
        label={label}
      />
      <Typography variant="body2" display="inline">
        {description}
      </Typography>
    </Container>
  );
}

/**
 * Introduce difference between Sync to cloud wiki and local wiki.
 * @returns
 */
export function SyncedWikiDescription({
  isCreateSyncedWorkspace,
  isCreateSyncedWorkspaceSetter,
}: {
  isCreateSyncedWorkspace: boolean;
  isCreateSyncedWorkspaceSetter: (is: boolean) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const label = isCreateSyncedWorkspace ? t('AddWorkspace.SyncedWorkspace') : t('AddWorkspace.LocalWorkspace');
  const description = isCreateSyncedWorkspace ? t('AddWorkspace.SyncedWorkspaceDescription') : t('AddWorkspace.LocalWorkspaceDescription');
  return (
    <Container elevation={0} square>
      <FormControlLabel
        control={<Switch checked={isCreateSyncedWorkspace} onChange={(event) => isCreateSyncedWorkspaceSetter(event.target.checked)} />}
        label={label}
      />
      <Typography variant="body2" display="inline">
        {description}
      </Typography>
    </Container>
  );
}
