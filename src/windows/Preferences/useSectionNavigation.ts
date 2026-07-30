import type { IPossibleWindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ISectionNavigationRequest {
  behavior: ScrollBehavior;
  requestId: number;
  sectionId: string;
}

type WindowMetaWithGotoTab = {
  preferenceGotoTab?: string;
};

interface IUseSectionNavigationResult {
  completeNavigation: (requestId: number) => void;
  navigateToSection: (sectionId: string, behavior?: ScrollBehavior) => void;
  navigationRequest: ISectionNavigationRequest | undefined;
}

/**
 * A single navigation stream shared by initial window metadata, metadata pushed
 * to an existing window, and in-window navigation such as sidebar clicks.
 */
export function useSectionNavigation(windowName: WindowNames): IUseSectionNavigationResult {
  const nextRequestId = useRef(0);
  const initialSectionId = (window.meta() as IPossibleWindowMeta<WindowMetaWithGotoTab>).preferenceGotoTab;
  const [navigationRequest, setNavigationRequest] = useState<ISectionNavigationRequest | undefined>(() =>
    initialSectionId
      ? { behavior: 'auto', requestId: ++nextRequestId.current, sectionId: initialSectionId }
      : undefined
  );

  const navigateToSection = useCallback((sectionId: string, behavior: ScrollBehavior = 'smooth') => {
    setNavigationRequest({
      behavior,
      requestId: ++nextRequestId.current,
      sectionId,
    });
  }, []);

  const completeNavigation = useCallback((requestId: number) => {
    setNavigationRequest((current) => current?.requestId === requestId ? undefined : current);
  }, []);

  useEffect(() => {
    const handleWindowMetaUpdated = (_event: Electron.IpcRendererEvent, meta: IPossibleWindowMeta<WindowMetaWithGotoTab>) => {
      if (meta.windowName !== windowName || !meta.preferenceGotoTab) return;
      navigateToSection(meta.preferenceGotoTab, 'auto');
    };
    window.remote.registerWindowMetaUpdated(handleWindowMetaUpdated);
    return () => {
      window.remote.unregisterWindowMetaUpdated(handleWindowMetaUpdated);
    };
  }, [navigateToSection, windowName]);

  return { completeNavigation, navigateToSection, navigationRequest };
}
