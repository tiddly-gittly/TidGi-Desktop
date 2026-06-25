import { useEffect } from 'react';

import type { IPossibleWindowMeta, WindowNames } from '@services/windows/WindowProperties';

interface UsePreferenceGotoTabOptions {
  /** Skip scrolling while the user is searching. */
  searchQuery?: string;
}

type WindowMetaWithGotoTab = {
  preferenceGotoTab?: string;
};

/**
 * Read `preferenceGotoTab` from window metadata and scroll to the matching section reference.
 *
 * Used by Preferences and EditWorkspace so both windows share the same deep-link
 * scroll behavior instead of duplicating the effect.
 */
export function usePreferenceGotoTab(
  windowName: WindowNames,
  sectionReferences: Map<string, React.RefObject<HTMLElement | null>>,
  options: UsePreferenceGotoTabOptions = {},
): void {
  const { searchQuery } = options;

  useEffect(() => {
    if (searchQuery?.trim()) return;
    const scrollTo = (window.meta() as IPossibleWindowMeta<WindowMetaWithGotoTab>).preferenceGotoTab;
    if (scrollTo === undefined) return;
    const timer = setTimeout(() => {
      const reference = sectionReferences.get(scrollTo);
      reference?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => {
      clearTimeout(timer);
    };
  }, [sectionReferences, searchQuery, windowName]);
}
