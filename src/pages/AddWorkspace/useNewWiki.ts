/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IWikiWorkspaceForm } from './useForm';

export function useValidateNewWiki(
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
    } else if (!form.parentFolderLocation) {
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
  }, [t, isCreateMainWorkspace, form.parentFolderLocation, form.wikiFolderName, form.gitRepoUrl, form.gitUserInfo, form.mainWikiToLink?.name, form.tagName]);

  return [wikiCreationMessage, hasError, wikiCreationMessageSetter, hasErrorSetter];
}

export function useNewWiki(
  isCreateMainWorkspace: boolean,
  form: IWikiWorkspaceForm,
  wikiCreationMessageSetter: (m: string) => void,
  hasErrorSetter: (m: boolean) => void,
): () => Promise<void> {
  const { t } = useTranslation();

  const onSubmit = useCallback(async () => {
    if (!form.parentFolderLocation || !form.wikiFolderName || !form.gitRepoUrl || !form.gitUserInfo) return;
    wikiCreationMessageSetter(t('AddWorkspace.Processing'));
    hasErrorSetter(false);
    try {
      if (isCreateMainWorkspace) {
        await window.service.wiki.copyWikiTemplate(form.parentFolderLocation, form.wikiFolderName);
        await window.service.wikiGitWorkspace.initWikiGitTransaction(form.wikiFolderLocation, form.gitRepoUrl, form.gitUserInfo, true);
      } else {
        await window.service.wiki.createSubWiki(form.parentFolderLocation, form.wikiFolderName, form.mainWikiToLink?.name, form.tagName);
        await window.service.wikiGitWorkspace.initWikiGitTransaction(form.wikiFolderLocation, form.gitRepoUrl, form.gitUserInfo, false);
      }
    } catch (error) {
      wikiCreationMessageSetter(String(error));
      hasErrorSetter(true);
    }
  }, [
    form.parentFolderLocation,
    form.wikiFolderName,
    form.gitRepoUrl,
    form.gitUserInfo,
    form.wikiFolderLocation,
    form.mainWikiToLink?.name,
    form.tagName,
    wikiCreationMessageSetter,
    t,
    hasErrorSetter,
    isCreateMainWorkspace,
  ]);

  return onSubmit;
}
