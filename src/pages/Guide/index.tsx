import { styled } from '@mui/material/styles';
import React from 'react';

import { useRestartSnackbar } from '@/components/RestartSnackbar';
import { List, Paper } from '@mui/material';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { LanguageSelectorItem } from '../../windows/Preferences/customItems/LanguageSelectorItem';
import { WikiUserNameItem } from '../../windows/Preferences/customItems/WikiUserNameItem';
import { NewUserMessage } from './NewUserMessage';

const InnerContentRoot = styled('div')`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px;
  width: 100%;
  height: 100%;
`;

export default function Guide(): React.JSX.Element {
  const workspacesList = useWorkspacesListObservable();
  const preferences = usePreferenceObservable();
  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar();
  return (
    <>
      <InnerContentRoot>
        {preferences !== undefined && Array.isArray(workspacesList) && workspacesList.length === 0 && (
          <NewUserMessage sidebar={preferences.sidebar} themeSource={preferences.themeSource} />
        )}
      </InnerContentRoot>
      <Paper elevation={0}>
        <List dense disablePadding>
          <LanguageSelectorItem />
          <WikiUserNameItem onNeedsRestart={requestRestartCountDown} />
        </List>
      </Paper>
      {RestartSnackbar}
    </>
  );
}
