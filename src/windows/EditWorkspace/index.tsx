import { Helmet } from '@dr.pogodin/react-helmet';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { allWorkspaceSections } from '@services/workspaces/definitions/registry';
import { useWorkspaceObservable } from '@services/workspaces/hooks';
import { isWikiWorkspace, type IWorkspace, nonConfigFields } from '@services/workspaces/interface';
import { useForm } from './useForm';

import { RestartSnackbarType, useRestartSnackbar } from '@/components/RestartSnackbar';
import { isEqual, omit } from 'lodash';
import { PageInner as Inner } from '../Preferences/PreferenceComponents';
import { SearchBar } from '../Preferences/SearchBar';
import { registerWorkspaceCustomSections } from './registerWorkspaceCustomSections';
import { Outter } from './styles';
import { Button, SaveCancelButtonsContainer } from './styles';
import { WorkspaceFormProvider } from './WorkspaceFormContext';
import { AllWorkspaceSectionsRenderer } from './WorkspaceSchemaRenderer';
import { WorkspaceSearchResultsView } from './WorkspaceSearchResultsView';
import { WorkspaceSectionSideBar } from './WorkspaceSectionSideBar';

// Wire custom components to the schema once at module load
registerWorkspaceCustomSections();

export default function EditWorkspace(): React.JSX.Element {
  const [workspaceID, setWorkspaceID] = useState<string | undefined>(() => (window.meta() as WindowMeta[WindowNames.editWorkspace]).workspaceID);
  const { t } = useTranslation();
  const originalWorkspace = useWorkspaceObservable(workspaceID);
  const [fallbackWorkspace, setFallbackWorkspace] = useState<IWorkspace | undefined>(undefined);

  // Fallback for rare cases where observable has not emitted yet but the workspace already exists in service storage.
  useEffect(() => {
    if (!workspaceID || originalWorkspace !== undefined || fallbackWorkspace !== undefined) return;
    void window.service.workspace.get(workspaceID).then((workspaceFromService) => {
      if (workspaceFromService) {
        setFallbackWorkspace(workspaceFromService);
      } else {
        void window.service.workspace.getActiveWorkspace().then((activeWorkspace) => {
          if (activeWorkspace) {
            setWorkspaceID(activeWorkspace.id);
            setFallbackWorkspace(activeWorkspace);
          }
        });
      }
    });
  }, [workspaceID, originalWorkspace, fallbackWorkspace]);

  const currentWorkspace = originalWorkspace ?? fallbackWorkspace;
  const [requestRestartCountDown, RestartSnackbar] = useRestartSnackbar({ waitBeforeCountDown: 0, workspace: originalWorkspace, restartType: RestartSnackbarType.Wiki });
  const [workspace, workspaceSetter, onSave] = useForm(currentWorkspace, requestRestartCountDown);
  const isWiki = workspace && isWikiWorkspace(workspace);
  const isSubWiki = isWiki ? workspace.isSubWiki : false;
  const [searchQuery, setSearchQuery] = useState('');

  // In e2e startup there is a brief window where meta can be undefined on first render.
  // Keep polling until workspaceID is available to avoid getting stuck on a permanent loading page.
  useEffect(() => {
    if (workspaceID) return;
    void window.service.workspace.getActiveWorkspace().then((activeWorkspace) => {
      if (activeWorkspace) {
        setWorkspaceID(activeWorkspace.id);
      }
    });
    const timer = setInterval(() => {
      const id = (window.meta() as WindowMeta[WindowNames.editWorkspace]).workspaceID;
      if (id) {
        setWorkspaceID(id);
        clearInterval(timer);
      }
    }, 100);
    return () => {
      clearInterval(timer);
    };
  }, [workspaceID]);

  // Build section refs from registry
  const sectionReferences = useMemo(() => {
    const map = new Map<string, React.RefObject<HTMLSpanElement | null>>();
    for (const section of allWorkspaceSections) {
      map.set(section.id, React.createRef<HTMLSpanElement>());
    }
    return map;
  }, []);

  const hiddenSections = useMemo(() => {
    const hidden = new Set<string>();
    if (isSubWiki) hidden.add('server');
    if (!isWiki) hidden.add('subWiki');
    return hidden;
  }, [isSubWiki, isWiki]);

  if (workspaceID === undefined || workspace === undefined) {
    return <Outter>{workspace === undefined ? t('Loading') : `Error ${workspaceID ?? '-'} not exists`}</Outter>;
  }

  const isSearching = searchQuery.trim().length > 0;
  const wikiWorkspace = isWiki ? workspace : undefined;

  return (
    <Outter>
      {RestartSnackbar}
      <Helmet>
        <title>
          {t('WorkspaceSelector.EditWorkspace')} {String(workspace.order ?? 1)} {workspace.name}
        </title>
      </Helmet>
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      {wikiWorkspace && (
        <WorkspaceFormProvider workspace={wikiWorkspace} workspaceSetter={workspaceSetter as (ws: typeof wikiWorkspace, nr?: boolean) => void}>
          {isSearching
            ? (
              <Inner>
                <WorkspaceSearchResultsView
                  query={searchQuery}
                  workspace={wikiWorkspace}
                  workspaceSetter={workspaceSetter as (ws: typeof wikiWorkspace, nr?: boolean) => void}
                  onNeedsRestart={requestRestartCountDown}
                />
              </Inner>
            )
            : (
              <>
                <WorkspaceSectionSideBar sectionRefs={sectionReferences} hiddenSections={hiddenSections} />
                <Inner>
                  <AllWorkspaceSectionsRenderer
                    workspace={wikiWorkspace}
                    workspaceSetter={workspaceSetter as (ws: typeof wikiWorkspace, nr?: boolean) => void}
                    onNeedsRestart={requestRestartCountDown}
                    sectionRefs={sectionReferences}
                    hiddenSections={hiddenSections}
                  />
                </Inner>
              </>
            )}
        </WorkspaceFormProvider>
      )}
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
    </Outter>
  );
}
