/* eslint-disable consistent-return */
/* eslint-disable unicorn/no-null */
/* eslint-disable unicorn/consistent-function-scoping */
import {
  ADD_WORKSPACE_CREATE_WIKI_MESSAGE,
  ADD_WORKSPACE_UPDATE_SCROLL_OFFSET,
  ADD_WORKSPACE_UPDATE_DOWNLOADING_ICON,
  ADD_WORKSPACE_UPDATE_FORM,
  ADD_WORKSPACE_UPDATE_MODE,
  ADD_WORKSPACE_UPDATE_QUERY,
} from '../../constants/actions';

import validate from '../../helpers/validate';
import isUrl from '../../helpers/is-url';
import hasErrors from '../../helpers/has-errors';

import { requestCreateWorkspace, requestWaitForWikiStart } from '../../senders';

export const setWikiCreationMessage = message => ({
  type: ADD_WORKSPACE_CREATE_WIKI_MESSAGE,
  value: message,
});

export const updateQuery = query => ({
  type: ADD_WORKSPACE_UPDATE_QUERY,
  query,
});

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
export const getWebsiteIconUrlAsync = url =>
  new Promise((resolve, reject) => {
    try {
      const id = Date.now().toString();
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.once(id, (event, newUrl) => {
        resolve(newUrl);
      });
      ipcRenderer.send('request-get-website-icon-url', id, url);
    } catch (error) {
      reject(error);
    }
  });

export const getIconFromInternet = forceOverwrite => (dispatch, getState) => {
  const {
    form: { picturePath, homeUrl, homeUrlError },
  } = getState().dialogAddWorkspace;
  if ((!forceOverwrite && picturePath) || !homeUrl || homeUrlError) return;

  dispatch({
    type: ADD_WORKSPACE_UPDATE_DOWNLOADING_ICON,
    downloadingIcon: true,
  });

  getWebsiteIconUrlAsync(homeUrl)
    .then(iconUrl => {
      const { form } = getState().dialogAddWorkspace;
      if (form.homeUrl === homeUrl) {
        const changes = { internetIcon: iconUrl || form.internetIcon };
        if (forceOverwrite) changes.picturePath = null;
        dispatch({
          type: ADD_WORKSPACE_UPDATE_FORM,
          changes,
        });
        dispatch({
          type: ADD_WORKSPACE_UPDATE_DOWNLOADING_ICON,
          downloadingIcon: false,
        });
      }

      if (forceOverwrite && !iconUrl) {
        const { remote } = window.require('electron');
        return remote.dialog.showMessageBox(remote.getCurrentWindow(), {
          message: 'Unable to find a suitable icon from the Internet.',
          buttons: ['OK'],
          cancelId: 0,
          defaultId: 0,
        });
      }

      return null;
    })
    .catch(console.log); // eslint-disable-line no-console
};

let timeout2;
export const updateForm = changes => (dispatch, getState) => {
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

export const save = () => async (dispatch, getState) => {
  const { form } = getState().dialogAddWorkspace;

  dispatch(setWikiCreationMessage('正在更新工作区'));
  const validatedChanges = validate(form, getValidationRules());
  if (hasErrors(validatedChanges)) {
    return dispatch(updateForm(validatedChanges));
  }

  const url = form.homeUrl.trim();
  const homeUrl = isUrl(url) ? url : `http://${url}`;

  await requestCreateWorkspace(
    form.name,
    form.isSubWiki,
    form.mainWikiToLink,
    form.port,
    homeUrl,
    form.gitUrl,
    form.internetIcon || form.picturePath,
    Boolean(form.transparentBackground),
  );
  dispatch(setWikiCreationMessage('工作区更新完毕，准备启动Wiki'));
  await requestWaitForWikiStart(form.port, 5000);
  const { remote } = window.require('electron');
  remote.getCurrentWindow().close();
};

export const updateMode = mode => ({
  type: ADD_WORKSPACE_UPDATE_MODE,
  mode,
});

export const updateScrollOffset = scrollOffset => ({
  type: ADD_WORKSPACE_UPDATE_SCROLL_OFFSET,
  scrollOffset,
});
