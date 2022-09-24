import { isMac } from '@/helpers/system';
import { container } from '@services/container';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';

export default async function getViewBounds(
  contentSize: [number, number],
  findInPage = false,
  height?: number,
  width?: number,
): Promise<{ height: number; width: number; x: number; y: number }> {
  const preferencesService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const [showSidebar, showTitleBar] = await Promise.all([preferencesService.get('sidebar'), preferencesService.get('titleBar')]);

  const x = showSidebar ? 68 : 0;
  /** add title bar height, move down 28px https://github.com/electron/electron/pull/34713 */
  const y = isMac && showTitleBar ? 28 : 0;

  if (findInPage) {
    const FIND_IN_PAGE_HEIGHT = 42;
    return {
      x,
      y: y + FIND_IN_PAGE_HEIGHT,
      height: height !== undefined ? height : contentSize[1] - FIND_IN_PAGE_HEIGHT,
      width: width !== undefined ? width : contentSize[0] - x,
    };
  }

  return {
    x,
    y,
    height: height !== undefined ? height : contentSize[1],
    width: width !== undefined ? width : contentSize[0] - x,
  };
}
