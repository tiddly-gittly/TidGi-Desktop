import * as mainWindow from '../windows/main';

const getViewBounds = (contentSize: any, findInPage = false, height: any, width: any) => {
  const showSidebar = global.sidebar;
  // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
  const isFullScreen = mainWindow.get() && mainWindow.get().isFullScreen();
  const showTitleBar = process.platform === 'darwin' && global.titleBar && !isFullScreen;
  const showNavigationBar = (process.platform === 'linux' && global.attachToMenubar && !global.sidebar) || global.navigationBar;

  const offsetTitlebar = showTitleBar ? 22 : 0;
  const x = showSidebar ? 68 : 0;
  const y = showNavigationBar ? 36 + offsetTitlebar : 0 + offsetTitlebar;

  if (findInPage) {
    const FIND_IN_PAGE_HEIGHT = 42;
    return {
      x,
      y: y + FIND_IN_PAGE_HEIGHT,
      height: height != undefined ? height : contentSize[1] - y - FIND_IN_PAGE_HEIGHT,
      width: width != undefined ? width : contentSize[0] - x,
    };
  }

  return {
    x,
    y,
    height: height != undefined ? height : contentSize[1] - y,
    width: width != undefined ? width : contentSize[0] - x,
  };
};

export default getViewBounds;
