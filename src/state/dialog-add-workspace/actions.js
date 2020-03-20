import algoliasearch from 'algoliasearch';

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

import validate from '../../helpers/validate';
import isUrl from '../../helpers/is-url';
import hasErrors from '../../helpers/has-errors';

import { requestCreateWorkspace } from '../../senders';

const client = algoliasearch('OQ55YRVMNP', 'fc0fb115b113c21d58ed6a4b4de1565f');
const index = client.initIndex('apps');

export const getHits = () => (dispatch, getState) => {
  const state = getState();

  const {
    isGetting,
    page,
    currentQuery,
    totalPage,
  } = state.dialogAddWorkspace;

  if (isGetting) return;

  // If all pages have already been fetched, we stop
  if (totalPage && page + 1 > totalPage) return;

  dispatch({
    type: ADD_WORKSPACE_GET_REQUEST,
  });

  index.search(currentQuery, {
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

export const resetThenGetHits = () => (dispatch, getState) => {
  const state = getState();
  const { query } = state.dialogAddWorkspace;

  dispatch({
    type: ADD_WORKSPACE_RESET,
  });
  dispatch({
    type: ADD_WORKSPACE_UPDATE_CURRENT_QUERY,
    currentQuery: query,
  });
  dispatch(getHits());
};

let timeout = null;
export const updateQuery = (query) => (dispatch, getState) => {
  const state = getState();

  const {
    currentQuery,
  } = state.dialogAddWorkspace;

  dispatch({
    type: ADD_WORKSPACE_UPDATE_QUERY,
    query,
  });
  clearTimeout(timeout);
  if (currentQuery !== query) {
    if (query === '') {
      dispatch(resetThenGetHits());
    } else {
      timeout = setTimeout(() => {
        dispatch(resetThenGetHits());
      }, 300);
    }
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

// to be replaced with invoke (electron 7+)
// https://electronjs.org/docs/api/ipc-renderer#ipcrendererinvokechannel-args
export const getWebsiteIconUrlAsync = (url) => new Promise((resolve, reject) => {
  try {
    const id = Date.now().toString();
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.once(id, (e, uurl) => {
      resolve(uurl);
    });
    ipcRenderer.send('request-get-website-icon-url', id, url);
  } catch (err) {
    reject(err);
  }
});

export const getIconFromInternet = (forceOverwrite) => (dispatch, getState) => {
  const { form: { picturePath, homeUrl, homeUrlError } } = getState().dialogAddWorkspace;
  if ((!forceOverwrite && picturePath) || !homeUrl || homeUrlError) return;

  dispatch({
    type: ADD_WORKSPACE_UPDATE_DOWNLOADING_ICON,
    downloadingIcon: true,
  });

  getWebsiteIconUrlAsync(homeUrl)
    .then((iconUrl) => {
      const { form } = getState().dialogAddWorkspace;
      if (form.homeUrl === homeUrl) {
        const changes = { internetIcon: iconUrl || form.internetIcon };
        if (forceOverwrite) changes.picturePath = null;
        dispatch(({
          type: ADD_WORKSPACE_UPDATE_FORM,
          changes,
        }));
        dispatch({
          type: ADD_WORKSPACE_UPDATE_DOWNLOADING_ICON,
          downloadingIcon: false,
        });
      }

      if (forceOverwrite && !iconUrl) {
        const { remote } = window.require('electron');
        remote.dialog.showMessageBox(remote.getCurrentWindow(), {
          message: 'Unable to find a suitable icon from the Internet.',
          buttons: ['OK'],
          cancelId: 0,
          defaultId: 0,
        });
      }
    }).catch(console.log); // eslint-disable-line no-console
};

let timeout2;
export const updateForm = (changes) => (dispatch, getState) => {
  const oldHomeUrl = getState().dialogAddWorkspace.form.homeUrl;

  dispatch({
    type: ADD_WORKSPACE_UPDATE_FORM,
    changes: validate(changes, getValidationRules()),
  });

  clearTimeout(timeout2);
  if (getState().dialogAddWorkspace.form.homeUrl === oldHomeUrl) return; // url didn't change
  if (changes.internetIcon === null) return; // user explictly want to get rid of icon
  timeout2 = setTimeout(() => {
    dispatch(getIconFromInternet());
  }, 300);
};

export const save = () => (dispatch, getState) => {
  const { form } = getState().dialogAddWorkspace;

  const validatedChanges = validate(form, getValidationRules());
  if (hasErrors(validatedChanges)) {
    return dispatch(updateForm(validatedChanges));
  }

  const url = form.homeUrl.trim();
  const homeUrl = isUrl(url) ? url : `http://${url}`;

  requestCreateWorkspace(
    form.name,
    homeUrl,
    form.internetIcon || form.picturePath,
    Boolean(form.transparentBackground),
  );
  const { remote } = window.require('electron');
  remote.getCurrentWindow().close();
  return null;
};

export const updateMode = (mode) => ({
  type: ADD_WORKSPACE_UPDATE_MODE,
  mode,
});
