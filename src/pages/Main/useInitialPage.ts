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
      
      // For menubar window, determine which workspace to show based on preferences
      if (windowName === WindowNames.menuBar && preferences) {
        const { menubarSyncWorkspaceWithMainWindow, menubarFixedWorkspaceId } = preferences;
        const shouldSync = menubarSyncWorkspaceWithMainWindow === undefined || menubarSyncWorkspaceWithMainWindow;
        
        if (!shouldSync && menubarFixedWorkspaceId) {
          // Use fixed workspace if not syncing
          const fixedWorkspace = workspacesList.find(ws => ws.id === menubarFixedWorkspaceId);
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
  
  // For menubar window, also listen to active workspace changes
  useEffect(() => {
    if (windowName !== WindowNames.menuBar || !workspacesList || !preferences) {
      return;
    }
    
    const { menubarSyncWorkspaceWithMainWindow, menubarFixedWorkspaceId } = preferences;
    const shouldSync = menubarSyncWorkspaceWithMainWindow === undefined || menubarSyncWorkspaceWithMainWindow;
    
    // Determine target workspace
    let targetWorkspace = workspacesList.find(workspace => workspace.active);
    if (!shouldSync && menubarFixedWorkspaceId) {
      const fixedWorkspace = workspacesList.find(ws => ws.id === menubarFixedWorkspaceId);
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
