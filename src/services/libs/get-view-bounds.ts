// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'mainWindow... Remove this comment to see the full error message
const mainWindow = require('../windows/main');

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getViewBou... Remove this comment to see the full error message
const getViewBounds = (contentSize: any, findInPage = false, height: any, width: any) => {
  const showSidebar = global.sidebar;
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

module.exports = getViewBounds;
