import { container } from '@services/container';
import type { IWindowService } from '@services/windows/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import serviceIdentifier from '@services/serviceIdentifier';

export default function getViewBounds(
  contentSize: [number, number],
  findInPage = false,
  height?: number,
  width?: number,
): { x: number; y: number; height: number; width: number } {
  const mainWindow = container.get<IWindowService>(serviceIdentifier.Window).get(WindowNames.main);
  const isFullScreen = mainWindow?.isFullScreen();
  const preferencesService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const showSidebar = preferencesService.get('sidebar');
  const showTitleBar = process.platform === 'darwin' && preferencesService.get('titleBar') && isFullScreen !== true;

  const offsetTitleBar = showTitleBar ? 22 : 0;
  const x = showSidebar ? 68 : 0;
  const y = offsetTitleBar;

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
