/* eslint-disable consistent-return */
/* eslint-disable unicorn/no-null */
/* eslint-disable unicorn/consistent-function-scoping */
import type { Dispatch } from 'redux';
import { ADD_WORKSPACE_CREATE_WIKI_MESSAGE, ADD_WORKSPACE_UPDATE_FORM } from '../../constants/actions';

import validate from '../../helpers/validate';
import isUrl from '../../helpers/is-url';
import hasErrors from '../../helpers/has-errors';

import { requestCreateWorkspace } from '../../senders';
import i18n from 'i18next';

export const setWikiCreationMessage = (message: string) => ({
  type: ADD_WORKSPACE_CREATE_WIKI_MESSAGE,
  value: message,
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

export const updateForm = (changes: any) => (dispatch: Dispatch, getState: any) => {
  const oldHomeUrl = getState().dialogAddWorkspace.form.homeUrl;

  dispatch({
    type: ADD_WORKSPACE_UPDATE_FORM,
    changes: validate(changes, getValidationRules()),
  });

  if (getState().dialogAddWorkspace.form.homeUrl === oldHomeUrl) return; // url didn't change
  if (changes.internetIcon === null) return; // user explictly want to get rid of icon
};

export const save = () => async (dispatch: any, getState: any) => {
  const { form } = getState().dialogAddWorkspace;

  dispatch(setWikiCreationMessage(i18n.t('AddWorkspace.StartUpdatingWorkspace')));
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
    form.tagName,
  );
  if (!form.isSubWiki) {
    dispatch(setWikiCreationMessage(i18n.t('AddWorkspace.WorkspaceUpdated')));
    // and wiki will be closed after wiki server started, close logic is inside wiki-worker-manager.js
  } else {
    window.remote.closeCurrentWindow();
  }
};
