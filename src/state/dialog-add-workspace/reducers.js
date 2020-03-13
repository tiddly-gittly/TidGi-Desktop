import { combineReducers } from 'redux';

import {
  ADD_WORKSPACE_GET_FAILED,
  ADD_WORKSPACE_GET_REQUEST,
  ADD_WORKSPACE_GET_SUCCESS,
  ADD_WORKSPACE_RESET,
  ADD_WORKSPACE_UPDATE_CURRENT_QUERY,
  ADD_WORKSPACE_UPDATE_DOWNLOADING_ICON,
  ADD_WORKSPACE_UPDATE_FORM,
  ADD_WORKSPACE_UPDATE_MODE,
  ADD_WORKSPACE_UPDATE_QUERY,
} from '../../constants/actions';

const hasFailed = (state = false, action) => {
  switch (action.type) {
    case ADD_WORKSPACE_GET_FAILED: return true;
    case ADD_WORKSPACE_GET_REQUEST: return false;
    case ADD_WORKSPACE_GET_SUCCESS: return false;
    default: return state;
  }
};

const hits = (state = [], action) => {
  switch (action.type) {
    case ADD_WORKSPACE_GET_SUCCESS: return state.concat(action.hits);
    case ADD_WORKSPACE_RESET: return [];
    default: return state;
  }
};

const isGetting = (state = false, action) => {
  switch (action.type) {
    case ADD_WORKSPACE_GET_FAILED: return false;
    case ADD_WORKSPACE_GET_REQUEST: return true;
    case ADD_WORKSPACE_GET_SUCCESS: return false;
    default: return state;
  }
};

const page = (state = -1, action) => {
  switch (action.type) {
    case ADD_WORKSPACE_GET_SUCCESS: return action.page;
    case ADD_WORKSPACE_RESET: return -1;
    default: return state;
  }
};

const currentQuery = (state = '', action) => {
  switch (action.type) {
    case ADD_WORKSPACE_UPDATE_CURRENT_QUERY: return action.currentQuery;
    default: return state;
  }
};

const query = (state = '', action) => {
  switch (action.type) {
    case ADD_WORKSPACE_UPDATE_QUERY: return action.query;
    default: return state;
  }
};

const totalPage = (state = 1, action) => {
  switch (action.type) {
    case ADD_WORKSPACE_GET_SUCCESS: return action.totalPage;
    case ADD_WORKSPACE_RESET: return 1;
    default: return state;
  }
};

const defaultForm = {
  name: '',
  homeUrl: '',
  picturePath: null,
};
const form = (state = defaultForm, action) => {
  switch (action.type) {
    case ADD_WORKSPACE_UPDATE_FORM: return { ...state, ...action.changes };
    default: return state;
  }
};

const defaultMode = 'catalog';
const mode = (state = defaultMode, action) => {
  switch (action.type) {
    case ADD_WORKSPACE_UPDATE_MODE: return action.mode;
    default: return state;
  }
};

const downloadingIcon = (state = false, action) => {
  switch (action.type) {
    case ADD_WORKSPACE_UPDATE_DOWNLOADING_ICON: return action.downloadingIcon;
    default: return state;
  }
};

export default combineReducers({
  currentQuery,
  downloadingIcon,
  form,
  hasFailed,
  hits,
  isGetting,
  mode,
  page,
  query,
  totalPage,
});
