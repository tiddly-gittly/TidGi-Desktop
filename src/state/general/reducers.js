import { combineReducers } from 'redux';

import {
  UPDATE_CAN_GO_BACK,
  UPDATE_CAN_GO_FORWARD,
  UPDATE_DID_FAIL_LOAD,
  UPDATE_IS_DARK_MODE,
  UPDATE_IS_DEFAULT_MAIL_CLIENT,
  UPDATE_IS_DEFAULT_WEB_BROWSER,
  UPDATE_IS_FULL_SCREEN,
  UPDATE_IS_LOADING,
  UPDATE_ADDRESS_BAR_INFO,
  UPDATE_TITLE,
} from '../../constants/actions';

const { remote } = window.require('electron');

const canGoBack = (state = false, action) => {
  switch (action.type) {
    case UPDATE_CAN_GO_BACK: return action.canGoBack;
    default: return state;
  }
};

const canGoForward = (state = false, action) => {
  switch (action.type) {
    case UPDATE_CAN_GO_FORWARD: return action.canGoForward;
    default: return state;
  }
};

const address = (state = null, action) => {
  switch (action.type) {
    case UPDATE_ADDRESS_BAR_INFO: return action.address;
    default: return state;
  }
};

const addressEdited = (state = false, action) => {
  switch (action.type) {
    case UPDATE_ADDRESS_BAR_INFO: return action.edited;
    default: return state;
  }
};

const title = (state = '', action) => {
  switch (action.type) {
    case UPDATE_TITLE: return action.title;
    default: return state;
  }
};

const isFullScreen = (state = remote.getCurrentWindow().isFullScreen(), action) => {
  switch (action.type) {
    case UPDATE_IS_FULL_SCREEN: return action.isFullScreen;
    default: return state;
  }
};

const isDefaultMailClient = (state = remote.app.isDefaultProtocolClient('mailto'), action) => {
  switch (action.type) {
    case UPDATE_IS_DEFAULT_MAIL_CLIENT: return action.isDefaultMailClient;
    default: return state;
  }
};

const isDefaultWebBrowser = (state = remote.app.isDefaultProtocolClient('http'), action) => {
  switch (action.type) {
    case UPDATE_IS_DEFAULT_WEB_BROWSER: return action.isDefaultWebBrowser;
    default: return state;
  }
};


const isDarkMode = (state = remote.systemPreferences.isDarkMode(), action) => {
  switch (action.type) {
    case UPDATE_IS_DARK_MODE: return action.isDarkMode;
    default: return state;
  }
};

const isLoading = (state = true, action) => {
  switch (action.type) {
    case UPDATE_IS_LOADING: return action.isLoading;
    default: return state;
  }
};

const didFailLoad = (state = false, action) => {
  switch (action.type) {
    case UPDATE_DID_FAIL_LOAD: return action.didFailLoad;
    default: return state;
  }
};

export default combineReducers({
  address,
  addressEdited,
  canGoBack,
  canGoForward,
  didFailLoad,
  isDarkMode,
  isDefaultMailClient,
  isDefaultWebBrowser,
  isFullScreen,
  isLoading,
  title,
});
