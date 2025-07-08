import { Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';

import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { ViewLoadErrorMessages, WikiErrorMessages } from './ErrorMessage';

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

export default function WikiBackground(): React.JSX.Element {
  const { t } = useTranslation();
  const workspacesList = useWorkspacesListObservable();
  const activeWorkspaceMetadata = workspacesList
    ?.map((workspace) => ({ active: workspace.active, ...workspace.metadata }))
    .find((workspace) => workspace.active);
  const activeWorkspace = workspacesList?.find((workspace) => workspace.active);
  const hasError = typeof activeWorkspaceMetadata?.didFailLoadErrorMessage === 'string' &&
    activeWorkspaceMetadata.didFailLoadErrorMessage.length > 0 &&
    activeWorkspaceMetadata.isLoading === false;
  return (
    <>
      <InnerContentRoot>
        {activeWorkspace !== undefined && hasError && <WikiErrorMessages activeWorkspace={activeWorkspace} />}
        {Array.isArray(workspacesList) && activeWorkspace !== undefined && workspacesList.length > 0 && hasError && (
          <ViewLoadErrorMessages activeWorkspace={activeWorkspace} activeWorkspaceMetadata={activeWorkspaceMetadata} />
        )}
        {Array.isArray(workspacesList) && workspacesList.length > 0 && activeWorkspaceMetadata?.isLoading === true && <Typography color='textSecondary'>{t('Loading')}</Typography>}
      </InnerContentRoot>
    </>
  );
}
