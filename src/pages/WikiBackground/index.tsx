/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/promise-function-async */
import { Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { useState } from 'react';
import { useAutoCreateFirstWorkspace } from '../Guide/useAutoCreateFirstWorkspace';
import { ViewLoadErrorMessages, WikiErrorMessages } from './ErrorMessage';

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
  return (
    <>
      <InnerContentRoot>
        {activeWorkspace !== undefined && hasError && <WikiErrorMessages activeWorkspace={activeWorkspace} />}
        {Array.isArray(workspacesList) && activeWorkspace !== undefined && workspacesList.length > 0 && hasError && (
          <ViewLoadErrorMessages activeWorkspace={activeWorkspace} activeWorkspaceMetadata={activeWorkspaceMetadata} />
        )}
        {Array.isArray(workspacesList) && workspacesList.length > 0 && activeWorkspaceMetadata?.isLoading === true && <Typography color='textSecondary'>{t('Loading')}</Typography>}
        {wikiCreationMessage && <Typography color='textSecondary'>{wikiCreationMessage}</Typography>}
      </InnerContentRoot>
    </>
  );
}
