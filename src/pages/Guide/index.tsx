/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/promise-function-async */
import { Typography } from '@mui/material';
import { styled } from 'styled-components';

import { usePreferenceObservable } from '@services/preferences/hooks';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { useState } from 'react';
import { Languages } from '../Preferences/sections/Languages';
import { TiddlyWiki } from '../Preferences/sections/TiddlyWiki';
import { NewUserMessage } from './NewUserMessage';
import { useAutoCreateFirstWorkspace } from './useAutoCreateFirstWorkspace';
import { useRestartSnackbar } from '@/components/RestartSnackbar';

const InnerContentRoot = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px;
  width: 100%;
  height: 100%;
`;

export function Guide(): React.JSX.Element {
  const workspacesList = useWorkspacesListObservable();
  const [wikiCreationMessage, wikiCreationMessageSetter] = useState('');
  useAutoCreateFirstWorkspace(workspacesList, wikiCreationMessageSetter);
  const preferences = usePreferenceObservable();
  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar();
  return (
    <>
      <InnerContentRoot>
        {wikiCreationMessage && <Typography color='textSecondary'>{wikiCreationMessage}</Typography>}
        {preferences !== undefined && Array.isArray(workspacesList) && workspacesList.length === 0 && (
          <NewUserMessage sidebar={preferences.sidebar} themeSource={preferences.themeSource} />
        )}
      </InnerContentRoot>
      <Languages languageSelectorOnly />
      <TiddlyWiki requestRestartCountDown={requestRestartCountDown} />
      {RestartSnackbar}
    </>
  );
}
