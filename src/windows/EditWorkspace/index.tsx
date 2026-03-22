import { Helmet } from '@dr.pogodin/react-helmet';
import { Divider } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { usePromiseValue } from '@/helpers/useServiceValue';
import { WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { useWorkspaceObservable } from '@services/workspaces/hooks';
import { useForm } from './useForm';

import { RestartSnackbarType, useRestartSnackbar } from '@/components/RestartSnackbar';
import { isWikiWorkspace, nonConfigFields } from '@services/workspaces/interface';
import { isEqual, omit } from 'lodash';
import { AppearanceOptions } from './AppearanceOptions';
import { MiscOptions } from './MiscOptions';
import { SaveAndSyncOptions } from './SaveAndSyncOptions';
import { ServerOptions } from './server';
import { Button, FlexGrow, Root, SaveCancelButtonsContainer } from './styles';
import { SubWorkspaceRouting } from './SubWorkspaceRouting';

export default function EditWorkspace(): React.JSX.Element {
  const workspaceID = (window.meta() as WindowMeta[WindowNames.editWorkspace]).workspaceID!;
  const { t } = useTranslation();
  const originalWorkspace = useWorkspaceObservable(workspaceID);
  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar({ waitBeforeCountDown: 0, workspace: originalWorkspace, restartType: RestartSnackbarType.Wiki });
  const [workspace, workspaceSetter, onSave] = useForm(originalWorkspace, requestRestartCountDown);
  const isWiki = workspace && isWikiWorkspace(workspace);
  const { order } = workspace ?? {};
  const { name } = workspace ?? {};

  const isSubWiki = isWiki ? workspace.isSubWiki : false;
  const shouldShowSubWorkspaceDetails = usePromiseValue(
    async () => {
      if (!isWiki) {
        return false;
      }
      if (isSubWiki) {
        return true;
      }
      const subWorkspaces = await window.service.workspace.getSubWorkspacesAsList(workspaceID);
      return subWorkspaces.length > 0;
    },
    false,
    [isWiki, isSubWiki, workspaceID],
  );

  const rememberLastPageVisited = usePromiseValue(async () => await window.service.preference.get('rememberLastPageVisited'));

  if (workspaceID === undefined) {
    return <Root>Error {workspaceID ?? '-'} not exists</Root>;
  }
  if (workspace === undefined) {
    return <Root>{t('Loading')}</Root>;
  }
  return (
    <Root>
      {RestartSnackbar}
      <Helmet>
        <title>
          {t('WorkspaceSelector.EditWorkspace')} {String(order ?? 1)} {name}
        </title>
      </Helmet>
      <FlexGrow>
        {!isSubWiki && (
          <>
            <Divider />
            <ServerOptions workspace={workspace} workspaceSetter={workspaceSetter} />
            <Divider />
          </>
        )}
        <AppearanceOptions workspace={workspace} workspaceSetter={workspaceSetter} />
        <SaveAndSyncOptions workspace={workspace} workspaceSetter={workspaceSetter} />
        {isWiki && (
          <SubWorkspaceRouting
            workspace={workspace}
            workspaceSetter={workspaceSetter}
            showDetails={shouldShowSubWorkspaceDetails ?? false}
          />
        )}
        <MiscOptions workspace={workspace} workspaceSetter={workspaceSetter} rememberLastPageVisited={rememberLastPageVisited} />
      </FlexGrow>
      {!isEqual(omit(workspace, nonConfigFields), omit(originalWorkspace, nonConfigFields)) && (
        <SaveCancelButtonsContainer>
          <Button color='primary' variant='contained' disableElevation onClick={() => void onSave()} data-testid='edit-workspace-save-button'>
            {t('EditWorkspace.Save')}
          </Button>
          <Button variant='contained' disableElevation onClick={() => void window.remote.closeCurrentWindow()} data-testid='edit-workspace-cancel-button'>
            {t('EditWorkspace.Cancel')}
          </Button>
        </SaveCancelButtonsContainer>
      )}
    </Root>
  );
}
