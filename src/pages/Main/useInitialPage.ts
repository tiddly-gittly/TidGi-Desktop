import { PageType } from '@/constants/pageTypes';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

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
        const { tidgiMiniWindowSyncWorkspaceWithMainWindow, tidgiMiniWindowFixedWorkspaceId } = preferences;
        const shouldSync = tidgiMiniWindowSyncWorkspaceWithMainWindow === undefined || tidgiMiniWindowSyncWorkspaceWithMainWindow;

        if (!shouldSync && tidgiMiniWindowFixedWorkspaceId) {
          // If not syncing with main window, use fixed workspace
          const fixedWorkspace = workspacesList.find(ws => ws.id === tidgiMiniWindowFixedWorkspaceId);
          if (fixedWorkspace) {
            targetWorkspace = fixedWorkspace;
          }
        }
        // Otherwise, use the active workspace (sync with main window)
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

    const { tidgiMiniWindowSyncWorkspaceWithMainWindow, tidgiMiniWindowFixedWorkspaceId } = preferences;
    const shouldSync = tidgiMiniWindowSyncWorkspaceWithMainWindow === undefined || tidgiMiniWindowSyncWorkspaceWithMainWindow;

    // Determine target workspace
    let targetWorkspace = workspacesList.find(workspace => workspace.active);
    if (!shouldSync && tidgiMiniWindowFixedWorkspaceId) {
      const fixedWorkspace = workspacesList.find(ws => ws.id === tidgiMiniWindowFixedWorkspaceId);
      if (fixedWorkspace) {
        targetWorkspace = fixedWorkspace;
      }
    }

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
