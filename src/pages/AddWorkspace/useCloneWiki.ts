/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IWikiWorkspaceForm } from './useForm';

export function useCloneWiki(isCreateMainWorkspace: boolean, form: IWikiWorkspaceForm): [() => void, string | undefined, boolean] {
  const { t } = useTranslation();
  const [wikiCreationErrorMessage, wikiCreationErrorMessageSetter] = useState<string | undefined>();
  const [hasError, hasErrorSetter] = useState<boolean>(false);
  useEffect(() => {
    if (form.gitUserInfo === undefined || !(form.gitUserInfo.accessToken?.length > 0)) {
      wikiCreationErrorMessageSetter(t('AddWorkspace.NotLoggedIn'));
      hasErrorSetter(true);
    } else if (!form.parentFolderLocation) {
      wikiCreationErrorMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.WorkspaceFolder')}`);
      hasErrorSetter(true);
    } else if (!form.wikiFolderName) {
      wikiCreationErrorMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.WorkspaceFolderNameToCreate')}`);
      hasErrorSetter(true);
    } else if (!form.gitRepoUrl) {
      wikiCreationErrorMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.GitRepoUrl')}`);
      hasErrorSetter(true);
    } else {
      hasErrorSetter(false);
    }
  }, [t, form.parentFolderLocation, form.wikiFolderName, form.gitRepoUrl, form.gitUserInfo]);

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
      wikiCreationErrorMessageSetter(String(error));
    }
  }, [isCreateMainWorkspace, form.parentFolderLocation, form.wikiFolderName, form.mainWikiToLink.name, form.gitRepoUrl, form.gitUserInfo, form.tagName]);

  return [onSubmit, wikiCreationErrorMessage, hasError];
}
