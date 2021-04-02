/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IWikiWorkspaceForm } from './useForm';

export function useCloneWiki(isCreateMainWorkspace: boolean, form: IWikiWorkspaceForm): [() => void, string | undefined, boolean] {
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
      hasErrorSetter(false);
    }
  }, [t, isCreateMainWorkspace, form.parentFolderLocation, form.wikiFolderName, form.gitRepoUrl, form.gitUserInfo, form.mainWikiToLink?.name, form.tagName]);

  const onSubmit = useCallback(async () => {
    if (!form.parentFolderLocation || !form.wikiFolderName || !form.gitRepoUrl || !form.gitUserInfo) return;
    try {
      if (isCreateMainWorkspace) {
        await window.service.wiki.cloneWiki(form.parentFolderLocation, form.wikiFolderName, form.gitRepoUrl, form.gitUserInfo);
      } else {
        await window.service.wiki.cloneSubWiki(
          form.parentFolderLocation,
          form.wikiFolderName,
          form.mainWikiToLink.name,
          form.gitRepoUrl,
          form.gitUserInfo,
          form.tagName,
        );
      }
    } catch (error) {
      wikiCreationMessageSetter(String(error));
      hasErrorSetter(true);
    }
  }, [isCreateMainWorkspace, form.parentFolderLocation, form.wikiFolderName, form.mainWikiToLink.name, form.gitRepoUrl, form.gitUserInfo, form.tagName]);

  return [onSubmit, wikiCreationMessage, hasError];
}
