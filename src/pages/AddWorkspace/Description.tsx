import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import SwitchRaw from '@mui/material/Switch';
import Typography from '@mui/material/Typography';

const Switch = styled(SwitchRaw)`
  & span.MuiSwitch-track,
  & > span:not(.Mui-checked) span.MuiSwitch-thumb {
    background-color: #1976d2;
  }
`;

const Container = styled(Paper)`
  background-color: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
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
        control={
          <Switch
            checked={isCreateMainWorkspace}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              isCreateMainWorkspaceSetter(event.target.checked);
            }}
          />
        }
        label={label}
      />
      <Typography variant='body2' display='inline'>
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
        control={
          <Switch
            checked={isCreateSyncedWorkspace}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              isCreateSyncedWorkspaceSetter(event.target.checked);
            }}
          />
        }
        label={label}
      />
      <Typography variant='body2' display='inline'>
        {description}
      </Typography>
    </Container>
  );
}
