import {
  UPDATE_CAN_GO_BACK,
  UPDATE_CAN_GO_FORWARD,
  UPDATE_DID_FAIL_LOAD,
  UPDATE_IS_DARK_MODE,
  UPDATE_IS_DEFAULT_MAIL_CLIENT,
  UPDATE_IS_FULL_SCREEN,
  UPDATE_IS_LOADING,
} from '../../constants/actions';

export const updateCanGoBack = (canGoBack) => (dispatch) => {
  dispatch({
    type: UPDATE_CAN_GO_BACK,
    canGoBack,
  });
};

export const updateCanGoForward = (canGoForward) => (dispatch) => {
  dispatch({
    type: UPDATE_CAN_GO_FORWARD,
    canGoForward,
  });
};


export const updateDidFailLoad = (didFailLoad) => (dispatch) => {
  dispatch({
    type: UPDATE_DID_FAIL_LOAD,
    didFailLoad,
  });
};

export const updateIsFullScreen = (isFullScreen) => (dispatch) => {
  dispatch({
    type: UPDATE_IS_FULL_SCREEN,
    isFullScreen,
  });
};

export const updateIsDefaultMailClient = (isDefaultMailClient) => (dispatch) => {
  dispatch({
    type: UPDATE_IS_DEFAULT_MAIL_CLIENT,
    isDefaultMailClient,
  });
};

export const updateIsDarkMode = (isDarkMode) => (dispatch) => {
  dispatch({
    type: UPDATE_IS_DARK_MODE,
    isDarkMode,
  });
};

export const updateIsLoading = (isLoading) => (dispatch) => {
  dispatch({
    type: UPDATE_IS_LOADING,
    isLoading,
  });
};
