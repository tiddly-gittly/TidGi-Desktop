import { container } from '@services/container';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { WindowNames } from '@services/windows/WindowProperties';

export default async function getViewBounds(
  contentSize: [number, number],
  config: { findInPage?: boolean; windowName?: WindowNames },
  height?: number,
  width?: number,
): Promise<{ height: number; width: number; x: number; y: number }> {
  const { findInPage = false, windowName } = config;
  const preferencesService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const [sidebar, tidgiMiniWindowShowSidebar] = await Promise.all([preferencesService.get('sidebar'), preferencesService.get('tidgiMiniWindowShowSidebar')]);
  const showSidebar = windowName === WindowNames.tidgiMiniWindow ? tidgiMiniWindowShowSidebar : sidebar;
  // Now showing sidebar on secondary window
  const secondary = windowName === WindowNames.secondary;
  const x = (showSidebar && !secondary) ? 68 : 0;
  const y = 0;

  if (findInPage) {
    const FIND_IN_PAGE_HEIGHT = 42;
    return {
      x,
      y: y + FIND_IN_PAGE_HEIGHT,
      height: height === undefined ? contentSize[1] - FIND_IN_PAGE_HEIGHT : height,
      width: width === undefined ? contentSize[0] - x : width,
    };
  }

  return {
    x,
    y,
    height: height === undefined ? contentSize[1] : height,
    width: width === undefined ? contentSize[0] - x : width,
  };
}
