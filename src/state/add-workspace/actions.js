import algoliasearch from 'algoliasearch';

import {
  ADD_WORKSPACE_GET_FAILED,
  ADD_WORKSPACE_GET_REQUEST,
  ADD_WORKSPACE_GET_SUCCESS,
  ADD_WORKSPACE_RESET,
  ADD_WORKSPACE_UPDATE_CURRENT_QUERY,
  ADD_WORKSPACE_UPDATE_QUERY,
  ADD_WORKSPACE_UPDATE_FORM,
  ADD_WORKSPACE_UPDATE_MODE,
} from '../../constants/actions';

import validate from '../../helpers/validate';
import hasErrors from '../../helpers/has-errors';

import { requestCreateWorkspace } from '../../senders';

const client = algoliasearch('OQ55YRVMNP', 'fc0fb115b113c21d58ed6a4b4de1565f');
const index = client.initIndex('apps');

const { remote } = window.require('electron');

export const getHits = () => (dispatch, getState) => {
  const state = getState();

  const {
    isGetting,
    page,
    query,
    totalPage,
  } = state.addWorkspace;

  if (isGetting) return;

  // If all pages have already been fetched, we stop
  if (totalPage && page + 1 > totalPage) return;

  dispatch({
    type: ADD_WORKSPACE_UPDATE_CURRENT_QUERY,
    currentQuery: query,
  });
  dispatch({
    type: ADD_WORKSPACE_GET_REQUEST,
  });

  index.search({
    query,
    page: page + 1,
    hitsPerPage: 24,
  })
    .then((res) => dispatch({
      type: ADD_WORKSPACE_GET_SUCCESS,
      hits: res.hits,
      page: res.page,
      totalPage: res.nbPages,
    }))
    .catch(() => dispatch({
      type: ADD_WORKSPACE_GET_FAILED,
    }));
};

export const resetThenGetHits = () => (dispatch) => {
  dispatch({
    type: ADD_WORKSPACE_RESET,
  });
  dispatch(getHits());
};

export const updateQuery = (query) => (dispatch, getState) => {
  const state = getState();

  const {
    currentQuery,
  } = state.addWorkspace;

  dispatch({
    type: ADD_WORKSPACE_UPDATE_QUERY,
    query,
  });
  if (query === '' && currentQuery !== query) {
    dispatch(resetThenGetHits());
  }
};

const getValidationRules = () => ({
  name: {
    fieldName: 'Name',
    required: true,
  },
  homeUrl: {
    fieldName: 'Home URL',
    required: true,
    url: true,
  },
});

export const updateForm = (changes) => ({
  type: ADD_WORKSPACE_UPDATE_FORM,
  changes: validate(changes, getValidationRules()),
});

export const save = () => (dispatch, getState) => {
  const { form } = getState().addWorkspace;

  const validatedChanges = validate(form, getValidationRules());
  if (hasErrors(validatedChanges)) {
    return dispatch(updateForm(validatedChanges));
  }

  requestCreateWorkspace(form.name, form.homeUrl, form.picturePath, form.mailtoHandler);
  remote.getCurrentWindow().close();
  return null;
};

export const updateMode = (mode) => ({
  type: ADD_WORKSPACE_UPDATE_MODE,
  mode,
});
