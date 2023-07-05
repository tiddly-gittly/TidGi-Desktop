/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/promise-function-async */
import { Typography } from '@material-ui/core';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { usePreferenceObservable } from '@services/preferences/hooks';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { useState } from 'react';
import { useAutoCreateFirstWorkspace } from '../Main/useAutoCreateFirstWorkspace';
import { Languages } from '../Preferences/sections/Languages';
import { TiddlyWiki } from '../Preferences/sections/TiddlyWiki';
import { ViewLoadErrorMessages, WikiErrorMessages } from './ErrorMessage';
import { NewUserMessage } from './NewUserMessage';

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

export function WikiBackground(): JSX.Element {
  const { t } = useTranslation();
  const workspacesList = useWorkspacesListObservable();

  const activeWorkspaceMetadata = workspacesList
    ?.map((workspace) => ({ active: workspace.active, ...workspace.metadata }))
    ?.find((workspace) => workspace.active);
  const activeWorkspace = workspacesList?.find((workspace) => workspace.active);
  const hasError = typeof activeWorkspaceMetadata?.didFailLoadErrorMessage === 'string' &&
    activeWorkspaceMetadata?.didFailLoadErrorMessage.length > 0 &&
    activeWorkspaceMetadata?.isLoading === false;
  const [wikiCreationMessage, wikiCreationMessageSetter] = useState('');
  useAutoCreateFirstWorkspace(workspacesList, wikiCreationMessageSetter);
  const preferences = usePreferenceObservable();
  if (preferences === undefined) return <div>{t('Loading')}</div>;

  const { sidebar, themeSource } = preferences;
  return (
    <>
      <InnerContentRoot>
        {activeWorkspace !== undefined && hasError && <WikiErrorMessages activeWorkspace={activeWorkspace} />}
        {Array.isArray(workspacesList) && activeWorkspace !== undefined && workspacesList.length > 0 && hasError && (
          <ViewLoadErrorMessages activeWorkspace={activeWorkspace} activeWorkspaceMetadata={activeWorkspaceMetadata} />
        )}
        {Array.isArray(workspacesList) && workspacesList.length > 0 && activeWorkspaceMetadata?.isLoading === true && <Typography color='textSecondary'>{t('Loading')}</Typography>}
        {wikiCreationMessage && <Typography color='textSecondary'>{wikiCreationMessage}</Typography>}
        {Array.isArray(workspacesList) && workspacesList.length === 0 && <NewUserMessage sidebar={sidebar} themeSource={themeSource} />}
      </InnerContentRoot>
      <Languages languageSelectorOnly />
      <TiddlyWiki />
    </>
  );
}
