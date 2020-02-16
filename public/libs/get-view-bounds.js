const getViewBounds = (contentSize, findInPage = false, height, width) => {
  const showSidebar = global.sidebar;
  const showTitleBar = (process.platform === 'darwin' && !global.attachToMenubar && !global.sidebar && !global.navigationBar) || global.titleBar;
  const showNavigationBar = (process.platform === 'linux'
    && global.attachToMenubar
    && !global.sidebar) || global.navigationBar;

  const offsetTitlebar = showTitleBar ? 22 : 0;
  const x = showSidebar ? 68 : 0;
  const y = showNavigationBar ? 36 + offsetTitlebar : 0 + offsetTitlebar;

  if (findInPage) {
    const FIND_IN_PAGE_HEIGHT = 42;
    return {
      x,
      y: y + FIND_IN_PAGE_HEIGHT,
      height: height || contentSize[1] - y - FIND_IN_PAGE_HEIGHT,
      width: width || contentSize[0] - x,
    };
  }

  return {
    x,
    y,
    height: height || contentSize[1] - y,
    width: width || contentSize[0] - x,
  };
};

module.exports = getViewBounds;
