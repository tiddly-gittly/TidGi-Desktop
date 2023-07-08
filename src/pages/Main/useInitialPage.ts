import { usePromiseValue } from '@/helpers/useServiceValue';
import { WindowNames } from '@services/windows/WindowProperties';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

export function useInitialPage() {
  const [, setLocation] = useLocation();
  // when first open the TidGi and no workspace is active (so no BrowserView will be on top of the React), goto the active pages route
  const initialActivePage = usePromiseValue(async () => await window.service.pages.getActivePage());
  // only do this once, and not triggering unnecessary rerender by using ref.
  const [alreadyInitialized, alreadyInitializedSetter] = useState(false);
  useEffect(() => {
    if (initialActivePage !== undefined && !alreadyInitialized) {
      setLocation(`/${WindowNames.main}/${initialActivePage.type}/${initialActivePage.id}/`);
      alreadyInitializedSetter(true);
    }
  }, [setLocation, initialActivePage, alreadyInitialized, alreadyInitializedSetter]);
}
