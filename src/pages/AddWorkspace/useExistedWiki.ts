/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IWikiWorkspaceForm } from './useForm';

export function useValidateExistedWiki(
  isCreateMainWorkspace: boolean,
  form: IWikiWorkspaceForm,
): [string | undefined, boolean, (m: string) => void, (m: boolean) => void] {
  const { t } = useTranslation();
  const [wikiCreationMessage, wikiCreationMessageSetter] = useState<string | undefined>();
  const [hasError, hasErrorSetter] = useState<boolean>(false);
  useEffect(() => {
    if (form.gitUserInfo === undefined || !(form.gitUserInfo.accessToken?.length > 0)) {
      wikiCreationMessageSetter(t('AddWorkspace.NotLoggedIn'));
      hasErrorSetter(true);
    } else if (!form.existedFolderLocation) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.ExistedWikiLocation')}`);
      hasErrorSetter(true);
    } else if (!isCreateMainWorkspace && !form.parentFolderLocation) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.WorkspaceFolder')}`);
      hasErrorSetter(true);
    } else if (!form.wikiFolderName) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.WorkspaceFolderNameToCreate')}`);
      hasErrorSetter(true);
    } else if (!form.gitRepoUrl) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.GitRepoUrl')}`);
      hasErrorSetter(true);
    } else if (!isCreateMainWorkspace && !form.mainWikiToLink?.name) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.MainWorkspace')}`);
      hasErrorSetter(true);
    } else if (!isCreateMainWorkspace && !form.tagName) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.TagName')}`);
      hasErrorSetter(true);
    } else {
      hasErrorSetter(false);
    }
  }, [
    t,
    isCreateMainWorkspace,
    form.parentFolderLocation,
    form.wikiFolderName,
    form.gitRepoUrl,
    form.gitUserInfo,
    form.mainWikiToLink?.name,
    form.tagName,
    form.existedFolderLocation,
  ]);
  return [wikiCreationMessage, hasError, wikiCreationMessageSetter, hasErrorSetter];
}
export function useExistedWiki(
  isCreateMainWorkspace: boolean,
  form: IWikiWorkspaceForm,
  wikiCreationMessageSetter: (m: string) => void,
  hasErrorSetter: (m: boolean) => void,
): () => Promise<void> {
  const { t } = useTranslation();

  useEffect(() => {
    if (form.gitUserInfo === undefined || !(form.gitUserInfo.accessToken?.length > 0)) {
      wikiCreationMessageSetter(t('AddWorkspace.NotLoggedIn'));
      hasErrorSetter(true);
    } else if (!form.existedFolderLocation) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.ExistedWikiLocation')}`);
      hasErrorSetter(true);
    } else if (!isCreateMainWorkspace && !form.parentFolderLocation) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.WorkspaceFolder')}`);
      hasErrorSetter(true);
    } else if (!form.wikiFolderName) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.WorkspaceFolderNameToCreate')}`);
      hasErrorSetter(true);
    } else if (!form.gitRepoUrl) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.GitRepoUrl')}`);
      hasErrorSetter(true);
    } else if (!isCreateMainWorkspace && !form.mainWikiToLink?.name) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.MainWorkspace')}`);
      hasErrorSetter(true);
    } else if (!isCreateMainWorkspace && !form.tagName) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.TagName')}`);
      hasErrorSetter(true);
    } else {
      wikiCreationMessageSetter('');
      hasErrorSetter(false);
    }
  }, [
    t,
    isCreateMainWorkspace,
    form.parentFolderLocation,
    form.wikiFolderName,
    form.gitRepoUrl,
    form.gitUserInfo,
    form.mainWikiToLink?.name,
    form.tagName,
    form.existedFolderLocation,
    wikiCreationMessageSetter,
    hasErrorSetter,
  ]);

  const onSubmit = useCallback(async () => {
    if (!form.existedFolderLocation || !form.parentFolderLocation || !form.gitRepoUrl || !form.gitUserInfo) return;
    wikiCreationMessageSetter(t('AddWorkspace.Processing'));
    try {
      if (isCreateMainWorkspace) {
        await window.service.wiki.ensureWikiExist(form.existedFolderLocation, true);
      } else {
        const wikiFolderNameForExistedFolder = window.remote.getBaseName(form.existedFolderLocation);
        const parentFolderLocationForExistedFolder = window.remote.getDirectoryName(form.existedFolderLocation);
        if (!wikiFolderNameForExistedFolder || !parentFolderLocationForExistedFolder) {
          throw new Error(
            `Undefined folder name: parentFolderLocationForExistedFolder: ${
              parentFolderLocationForExistedFolder ?? '-'
            }, parentFolderLocationForExistedFolder: ${parentFolderLocationForExistedFolder ?? '-'}`,
          );
        }
        await window.service.wiki.ensureWikiExist(form.existedFolderLocation, false);
        await window.service.wiki.createSubWiki(
          wikiFolderNameForExistedFolder,
          parentFolderLocationForExistedFolder,
          form.mainWikiToLink?.name,
          form.tagName,
          true,
        );
      }
    } catch (error) {
      wikiCreationMessageSetter(String(error));
      hasErrorSetter(true);
    }
  }, [
    form.existedFolderLocation,
    form.parentFolderLocation,
    form.gitRepoUrl,
    form.gitUserInfo,
    form.mainWikiToLink?.name,
    form.tagName,
    isCreateMainWorkspace,
    wikiCreationMessageSetter,
    hasErrorSetter,
  ]);

  return onSubmit;
}
