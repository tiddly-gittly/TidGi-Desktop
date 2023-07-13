/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/promise-function-async */
import { Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { usePreferenceObservable } from '@services/preferences/hooks';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { useState } from 'react';
import { Languages } from '../Preferences/sections/Languages';
import { TiddlyWiki } from '../Preferences/sections/TiddlyWiki';
import { NewUserMessage } from './NewUserMessage';
import { useAutoCreateFirstWorkspace } from './useAutoCreateFirstWorkspace';

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

export function Guide(): JSX.Element {
  const { t } = useTranslation();
  const workspacesList = useWorkspacesListObservable();
  const [wikiCreationMessage, wikiCreationMessageSetter] = useState('');
  useAutoCreateFirstWorkspace(workspacesList, wikiCreationMessageSetter);
  const preferences = usePreferenceObservable();
  return (
    <>
      <InnerContentRoot>
        {wikiCreationMessage && <Typography color='textSecondary'>{wikiCreationMessage}</Typography>}
        {preferences !== undefined && Array.isArray(workspacesList) && workspacesList.length === 0 && (
          <NewUserMessage sidebar={preferences.sidebar} themeSource={preferences.themeSource} />
        )}
      </InnerContentRoot>
      <Languages languageSelectorOnly />
      <TiddlyWiki />
    </>
  );
}
