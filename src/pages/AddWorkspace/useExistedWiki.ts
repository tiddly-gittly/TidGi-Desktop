/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IWikiWorkspaceForm } from './useForm';

export function useValidateExistedWiki(
  isCreateMainWorkspace: boolean,
  isCreateSyncedWorkspace: boolean,
  form: IWikiWorkspaceForm,
): [Record<string, boolean>, boolean, string | undefined, (m: string) => void, (m: boolean) => void] {
  const { t } = useTranslation();
  const [wikiCreationMessage, wikiCreationMessageSetter] = useState<string | undefined>();
  const [hasError, hasErrorSetter] = useState<boolean>(false);
  const [errorInWhichComponent, errorInWhichComponentSetter] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!form.existedWikiFolderPath) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.ExistedWikiLocation')}`);
      errorInWhichComponentSetter({ existedWikiFolderPath: true });
      hasErrorSetter(true);
    } else if (!isCreateMainWorkspace && !form.parentFolderLocation) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.WorkspaceFolder')}`);
      errorInWhichComponentSetter({ parentFolderLocation: true });
      hasErrorSetter(true);
    } else if (!form.wikiFolderName) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.WorkspaceFolderNameToCreate')}`);
      errorInWhichComponentSetter({ wikiFolderName: true });
      hasErrorSetter(true);
    } else if (isCreateSyncedWorkspace && !form.gitRepoUrl) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.GitRepoUrl')}`);
      errorInWhichComponentSetter({ gitRepoUrl: true });
      hasErrorSetter(true);
    } else if (!isCreateMainWorkspace && !form.mainWikiToLink?.wikiFolderLocation) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.MainWorkspace')}`);
      errorInWhichComponentSetter({ mainWikiToLink: true });
      hasErrorSetter(true);
    } else if (!isCreateMainWorkspace && !form.tagName) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.TagName')}`);
      errorInWhichComponentSetter({ tagName: true });
      hasErrorSetter(true);
    } else if (isCreateSyncedWorkspace && (form.gitUserInfo === undefined || !(form.gitUserInfo.accessToken?.length > 0))) {
      wikiCreationMessageSetter(t('AddWorkspace.NotLoggedIn'));
      errorInWhichComponentSetter({ gitUserInfo: true });
      hasErrorSetter(true);
    } else {
      errorInWhichComponentSetter({});
      hasErrorSetter(false);
    }
  }, [
    t,
    isCreateMainWorkspace,
    isCreateSyncedWorkspace,
    form.parentFolderLocation,
    form.wikiFolderName,
    form.gitRepoUrl,
    form.gitUserInfo,
    form.mainWikiToLink?.wikiFolderLocation,
    form.tagName,
    form.existedWikiFolderPath,
  ]);
  return [errorInWhichComponent, hasError, wikiCreationMessage, wikiCreationMessageSetter, hasErrorSetter];
}
export function useExistedWiki(
  isCreateMainWorkspace: boolean,
  form: IWikiWorkspaceForm,
  wikiCreationMessageSetter: (m: string) => void,
  hasErrorSetter: (m: boolean) => void,
): () => Promise<void> {
  const { t } = useTranslation();

  const onSubmit = useCallback(async () => {
    if (!form.existedWikiFolderPath || !form.parentFolderLocation || !form.gitRepoUrl || !form.gitUserInfo) return;
    wikiCreationMessageSetter(t('AddWorkspace.Processing'));
    try {
      if (isCreateMainWorkspace) {
        await window.service.wiki.ensureWikiExist(form.existedWikiFolderPath, true);
      } else {
        const wikiFolderNameForExistedFolder = window.remote.getBaseName(form.existedWikiFolderPath);
        const parentFolderLocationForExistedFolder = window.remote.getDirectoryName(form.existedWikiFolderPath);
        if (!wikiFolderNameForExistedFolder || !parentFolderLocationForExistedFolder) {
          throw new Error(
            `Undefined folder name: parentFolderLocationForExistedFolder: ${
              parentFolderLocationForExistedFolder ?? '-'
            }, parentFolderLocationForExistedFolder: ${parentFolderLocationForExistedFolder ?? '-'}`,
          );
        }
        await window.service.wiki.ensureWikiExist(form.existedWikiFolderPath, false);
        await window.service.wiki.createSubWiki(
          wikiFolderNameForExistedFolder,
          parentFolderLocationForExistedFolder,
          form.mainWikiToLink?.wikiFolderLocation,
          form.tagName,
          true,
        );
      }
    } catch (error) {
      wikiCreationMessageSetter((error as Error).message);
      hasErrorSetter(true);
    }
  }, [
    form.existedWikiFolderPath,
    form.parentFolderLocation,
    form.gitRepoUrl,
    form.gitUserInfo,
    form.mainWikiToLink?.wikiFolderLocation,
    form.tagName,
    wikiCreationMessageSetter,
    t,
    isCreateMainWorkspace,
    hasErrorSetter,
  ]);

  return onSubmit;
}
