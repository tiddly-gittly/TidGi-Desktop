import { PageType } from '@/constants/pageTypes';
import { usePreferenceObservable } from '@services/preferences/hooks';
import type { IPreferences } from '@services/preferences/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import type { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

/**
 * Helper function to determine the target workspace for tidgi mini window based on preferences
 */
function getTidgiMiniWindowTargetWorkspace(
  workspacesList: IWorkspaceWithMetadata[],
  preferences: IPreferences,
): IWorkspaceWithMetadata | undefined {
  const { tidgiMiniWindowSyncWorkspaceWithMainWindow, tidgiMiniWindowFixedWorkspaceId } = preferences;
  // Default to sync (undefined means default to true, or explicitly true)
  const shouldSync = tidgiMiniWindowSyncWorkspaceWithMainWindow === undefined || tidgiMiniWindowSyncWorkspaceWithMainWindow;

  if (shouldSync) {
    // Sync with main window - use active workspace
    return workspacesList.find(workspace => workspace.active);
  } else if (tidgiMiniWindowFixedWorkspaceId) {
    // Use fixed workspace
    return workspacesList.find(ws => ws.id === tidgiMiniWindowFixedWorkspaceId);
  }
  // No fixed workspace set - return undefined
  return undefined;
}

export function useInitialPage() {
  const [location, setLocation] = useLocation();
  const workspacesList = useWorkspacesListObservable();
  const preferences = usePreferenceObservable();
  const hasInitialized = useRef(false);
  const windowName = window.meta().windowName;

  useEffect(() => {
    // Only initialize once and only when at root
    if (workspacesList && !hasInitialized.current && (location === '/' || location === '')) {
      hasInitialized.current = true;

      let targetWorkspace = workspacesList.find(workspace => workspace.active);

      // For tidgi mini window, determine which workspace to show based on preferences
      if (windowName === WindowNames.tidgiMiniWindow && preferences) {
        targetWorkspace = getTidgiMiniWindowTargetWorkspace(workspacesList, preferences) || targetWorkspace;
      }

      if (!targetWorkspace) {
        // If there's no active workspace, navigate to root instead of guide.
        // Root lets the UI stay neutral and prevents forcing the guide view.
        setLocation(`/`);
      } else if (targetWorkspace.pageType) {
        // Don't navigate to add page, fallback to guide instead
        if (targetWorkspace.pageType === PageType.add) {
          setLocation(`/`);
        } else {
          setLocation(`/${targetWorkspace.pageType}`);
        }
      } else {
        setLocation(`/${PageType.wiki}/${targetWorkspace.id}/`);
      }
    }
  }, [location, workspacesList, preferences, windowName, setLocation]);

  // For tidgi mini window, also listen to active workspace changes
  useEffect(() => {
    if (windowName !== WindowNames.tidgiMiniWindow || !workspacesList || !preferences) {
      return;
    }

    // Determine target workspace using helper function
    const targetWorkspace = getTidgiMiniWindowTargetWorkspace(workspacesList, preferences);

    if (!targetWorkspace) return;

    // Navigate to the target workspace's page
    let targetPath = '/';
    if (targetWorkspace.pageType && targetWorkspace.pageType !== PageType.add) {
      targetPath = `/${targetWorkspace.pageType}`;
    } else if (!targetWorkspace.pageType) {
      targetPath = `/${PageType.wiki}/${targetWorkspace.id}/`;
    }

    // Only navigate if we're not already on the target path
    if (location !== targetPath) {
      setLocation(targetPath);
    }
  }, [windowName, workspacesList, preferences, location, setLocation]);
}
