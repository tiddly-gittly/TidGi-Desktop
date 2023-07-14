/* eslint-disable unicorn/no-null */
import { usePromiseValue } from '@/helpers/useServiceValue';
import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

export function useInitialPage() {
  const [, setLocation] = useLocation();
  // when first open the TidGi and no workspace is active (so no BrowserView will be on top of the React), goto the active pages route
  const initialActivePage = usePromiseValue(async () => await window.service.pages.getActivePage(), null);
  const initialActiveWorkspace = usePromiseValue(async () => await window.service.workspace.getActiveWorkspace(), null);
  // only do this once, and not triggering unnecessary rerender by using ref.
  const [alreadyInitialized, alreadyInitializedSetter] = useState(false);
  useEffect(() => {
    // active workspace has priority to show, so if a page is also active in settings, don't set it as active because it is hidden
    if (initialActivePage !== null && initialActiveWorkspace !== null && !alreadyInitialized) {
      if (initialActiveWorkspace === undefined) {
        if (initialActivePage !== undefined) {
          setLocation(`/${WindowNames.main}/${initialActivePage.type}/`);
        }
      } else {
        setLocation(`/${WindowNames.main}/${PageType.wiki}/${initialActiveWorkspace.id}/`);
      }
      alreadyInitializedSetter(true);
    }
  }, [setLocation, initialActivePage, alreadyInitialized, alreadyInitializedSetter, initialActiveWorkspace]);
}
