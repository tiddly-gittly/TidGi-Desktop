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
  const showSidebar = await preferencesService.get('sidebar');

  const x = showSidebar ? 68 : 0;
  const y = 0;

  if (findInPage) {
    const FIND_IN_PAGE_HEIGHT = 42;
    return {
      x,
      y: y + FIND_IN_PAGE_HEIGHT,
      height: height !== undefined ? height : contentSize[1] - y - FIND_IN_PAGE_HEIGHT,
      width: width !== undefined ? width : contentSize[0] - x,
    };
  }

  return {
    x,
    y,
    height: height !== undefined ? height : contentSize[1] - y,
    width: width !== undefined ? width : contentSize[0] - x,
  };
}
