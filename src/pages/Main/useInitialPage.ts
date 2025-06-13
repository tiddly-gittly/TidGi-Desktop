import { PageType } from '@/constants/pageTypes';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

export function useInitialPage() {
  const [location, setLocation] = useLocation();
  const workspacesList = useWorkspacesListObservable();
  const hasInitialized = useRef(false);
  useEffect(() => {
    // Only initialize once and only when at root
    if (workspacesList && !hasInitialized.current && (location === '/' || location === '')) {
      hasInitialized.current = true;
      const activeWorkspace = workspacesList.find(workspace => workspace.active);
      if (!activeWorkspace) {
        setLocation(`/${PageType.guide}`);
      } else if (activeWorkspace.pageType) {
        // Don't navigate to add page, fallback to guide instead
        if (activeWorkspace.pageType === PageType.add) {
          setLocation(`/${PageType.guide}`);
        } else {
          setLocation(`/${activeWorkspace.pageType}`);
        }
      } else {
        setLocation(`/${PageType.wiki}/${activeWorkspace.id}/`);
      }
    }
  }, [location, workspacesList, setLocation]);
}
