import { PageType } from '@/constants/pageTypes';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

export function useInitialPage() {
  const [, setLocation] = useLocation();
  // Get the initial active workspace (could be a page workspace or regular workspace)
  const initialActiveWorkspace = usePromiseValue(async () => await window.service.workspace.getActiveWorkspace(), null);
  // only do this once, and not triggering unnecessary rerender by using ref.
  const [alreadyInitialized, alreadyInitializedSetter] = useState(false);
  useEffect(() => {
    // Navigate to the active workspace (page workspace or regular workspace)
    if (initialActiveWorkspace !== null && !alreadyInitialized) {
      alreadyInitializedSetter(true);
      if (initialActiveWorkspace === undefined) {
        // No active workspace, navigate to guide page by default
        setLocation(`/${PageType.guide}/`);
      } else {
        if (initialActiveWorkspace.pageType) {
          // It's a page workspace, navigate to the page
          setLocation(`/${initialActiveWorkspace.pageType}/`);
        } else {
          // It's a regular workspace, navigate to wiki
          setLocation(`/${PageType.wiki}/${initialActiveWorkspace.id}/`);
        }
      }
    }
  }, [setLocation, alreadyInitialized, alreadyInitializedSetter, initialActiveWorkspace]);
}
