import { container } from '@services/container';
import { Window } from '@services/windows';
import { Preference } from '@services/preferences';
import { WindowNames } from '@services/windows/WindowProperties';

export default function getViewBounds(
  contentSize: [number, number],
  findInPage = false,
  height?: number,
  width?: number,
): { x: number; y: number; height: number; width: number } {
  const mainWindow = container.resolve(Window).get(WindowNames.main);
  const isFullScreen = mainWindow?.isFullScreen();
  const preferencesService = container.resolve(Preference);
  const showSidebar = preferencesService.get('sidebar');
  const showTitleBar = process.platform === 'darwin' && preferencesService.get('titleBar') && isFullScreen !== true;
  const showNavigationBar =
    (process.platform === 'linux' && preferencesService.get('attachToMenubar') && !showSidebar) || preferencesService.get('navigationBar');

  const offsetTitleBar = showTitleBar ? 22 : 0;
  const x = showSidebar ? 68 : 0;
  const y = showNavigationBar ? 36 + offsetTitleBar : 0 + offsetTitleBar;

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
