import { Helmet } from '@dr.pogodin/react-helmet';
import { Divider } from '@mui/material';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePromiseValue } from '@/helpers/useServiceValue';
import { WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { useWorkspaceObservable } from '@services/workspaces/hooks';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { useForm } from './useForm';

import { RestartSnackbarType, useRestartSnackbar } from '@/components/RestartSnackbar';
import { nonConfigFields } from '@services/workspaces/interface';
import { isEqual, omit } from 'lodash';
import { SearchBar } from '../Preferences/SearchBar';
import { AppearanceOptions } from './AppearanceOptions';
import { MiscOptions } from './MiscOptions';
import { SaveAndSyncOptions } from './SaveAndSyncOptions';
import { ServerOptions } from './server';
import { Button, ContentWithSidebar, Root, SaveCancelButtonsContainer, SidebarAndContent } from './styles';
import { SubWorkspaceRouting } from './SubWorkspaceRouting';
import { useWorkspaceSections, WorkspaceSections } from './useWorkspaceSections';
import { WorkspaceSearchResultsView } from './WorkspaceSearchResultsView';
import { WorkspaceSectionSideBar } from './WorkspaceSectionSideBar';

export default function EditWorkspace(): React.JSX.Element {
  const workspaceID = (window.meta() as WindowMeta[WindowNames.editWorkspace]).workspaceID!;
  const { t } = useTranslation();
  const originalWorkspace = useWorkspaceObservable(workspaceID);
  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar({ waitBeforeCountDown: 0, workspace: originalWorkspace, restartType: RestartSnackbarType.Wiki });
  const [workspace, workspaceSetter, onSave] = useForm(originalWorkspace, requestRestartCountDown);
  const isWiki = workspace && isWikiWorkspace(workspace);
  const { order } = workspace ?? {};
  const { name } = workspace ?? {};
  const [searchQuery, setSearchQuery] = useState('');

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

  // Must be called before any early returns (Rules of Hooks)
  const sections = useWorkspaceSections({
    hideServer: isSubWiki,
    hideSubWiki: !isWiki,
  });

  if (workspaceID === undefined) {
    return <Root>Error {workspaceID ?? '-'} not exists</Root>;
  }
  if (workspace === undefined) {
    return <Root>{t('Loading')}</Root>;
  }

  const isSearching = searchQuery.trim().length > 0;

  return (
    <Root>
      {RestartSnackbar}
      <Helmet>
        <title>
          {t('WorkspaceSelector.EditWorkspace')} {String(order ?? 1)} {name}
        </title>
      </Helmet>
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <SidebarAndContent>
        {!isSearching && <WorkspaceSectionSideBar sections={sections} />}
        <ContentWithSidebar>
          {isSearching && isWiki
            ? (
              <WorkspaceSearchResultsView
                query={searchQuery}
                workspace={workspace}
                workspaceSetter={workspaceSetter}
                onNeedsRestart={requestRestartCountDown}
              />
            )
            : (
              <>
                <AppearanceOptions
                  workspace={workspace}
                  workspaceSetter={workspaceSetter}
                  sectionRef={sections[WorkspaceSections.appearance].ref}
                />
                <Divider />
                <SaveAndSyncOptions
                  workspace={workspace}
                  workspaceSetter={workspaceSetter}
                  sectionRef={sections[WorkspaceSections.saveAndSync].ref}
                />
                {!isSubWiki && (
                  <>
                    <Divider />
                    <ServerOptions
                      workspace={workspace}
                      workspaceSetter={workspaceSetter}
                      sectionRef={sections[WorkspaceSections.server].ref}
                    />
                  </>
                )}
                {isWiki && (
                  <>
                    <Divider />
                    <SubWorkspaceRouting
                      workspace={workspace}
                      workspaceSetter={workspaceSetter}
                      showDetails={shouldShowSubWorkspaceDetails ?? false}
                      sectionRef={sections[WorkspaceSections.subWiki].ref}
                    />
                  </>
                )}
                <Divider />
                <MiscOptions
                  workspace={workspace}
                  workspaceSetter={workspaceSetter}
                  rememberLastPageVisited={rememberLastPageVisited}
                  sectionRef={sections[WorkspaceSections.misc].ref}
                />
              </>
            )}
        </ContentWithSidebar>
      </SidebarAndContent>
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
