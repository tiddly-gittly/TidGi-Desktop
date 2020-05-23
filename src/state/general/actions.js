import {
  UPDATE_SHOULD_USE_DARK_COLORS,
  UPDATE_ADDRESS_BAR_INFO,
  UPDATE_CAN_GO_BACK,
  UPDATE_CAN_GO_FORWARD,
  UPDATE_IS_FULL_SCREEN,
  UPDATE_TITLE,
} from '../../constants/actions';

export const updateShouldUseDarkColors = (shouldUseDarkColors) => ({
  type: UPDATE_SHOULD_USE_DARK_COLORS,
  shouldUseDarkColors,
});

export const updateCanGoBack = (canGoBack) => ({
  type: UPDATE_CAN_GO_BACK,
  canGoBack,
});

export const updateCanGoForward = (canGoForward) => ({
  type: UPDATE_CAN_GO_FORWARD,
  canGoForward,
});

export const updateIsFullScreen = (isFullScreen) => ({
  type: UPDATE_IS_FULL_SCREEN,
  isFullScreen,
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
