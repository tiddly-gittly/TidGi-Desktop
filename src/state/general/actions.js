import {
  UPDATE_SHOULD_USE_DARK_COLORS,
  UPDATE_THEME_SOURCE,
  UPDATE_ADDRESS_BAR_INFO,
  UPDATE_CAN_GO_BACK,
  UPDATE_CAN_GO_FORWARD,
  UPDATE_DID_FAIL_LOAD,
  UPDATE_IS_DEFAULT_MAIL_CLIENT,
  UPDATE_IS_DEFAULT_WEB_BROWSER,
  UPDATE_IS_FULL_SCREEN,
  UPDATE_IS_LOADING,
  UPDATE_TITLE,
} from '../../constants/actions';

export const updateShouldUseDarkColors = (shouldUseDarkColors) => ({
  type: UPDATE_SHOULD_USE_DARK_COLORS,
  shouldUseDarkColors,
});

export const updateThemeSource = (themeSource) => ({
  type: UPDATE_THEME_SOURCE,
  themeSource,
});

export const updateCanGoBack = (canGoBack) => ({
  type: UPDATE_CAN_GO_BACK,
  canGoBack,
});

export const updateCanGoForward = (canGoForward) => ({
  type: UPDATE_CAN_GO_FORWARD,
  canGoForward,
});

export const updateDidFailLoad = (didFailLoad) => ({
  type: UPDATE_DID_FAIL_LOAD,
  didFailLoad,
});

export const updateIsFullScreen = (isFullScreen) => ({
  type: UPDATE_IS_FULL_SCREEN,
  isFullScreen,
});

export const updateIsDefaultMailClient = (isDefaultMailClient) => ({
  type: UPDATE_IS_DEFAULT_MAIL_CLIENT,
  isDefaultMailClient,
});

export const updateIsDefaultWebBrowser = (isDefaultWebBrowser) => ({
  type: UPDATE_IS_DEFAULT_WEB_BROWSER,
  isDefaultWebBrowser,
});

export const updateIsLoading = (isLoading) => ({
  type: UPDATE_IS_LOADING,
  isLoading,
});

export const updateAddressBarInfo = (address, edited) => ({
  type: UPDATE_ADDRESS_BAR_INFO,
  address,
  edited,
});

export const updateTitle = (title) => ({
  type: UPDATE_TITLE,
  title,
});
