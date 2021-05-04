/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IWikiWorkspaceForm, workspaceConfigFromForm } from './useForm';

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
  isCreateSyncedWorkspace: boolean,
  form: IWikiWorkspaceForm,
  wikiCreationMessageSetter: (m: string) => void,
  hasErrorSetter: (m: boolean) => void,
): () => Promise<void> {
  const { t } = useTranslation();

  const onSubmit = useCallback(async () => {
    wikiCreationMessageSetter(t('AddWorkspace.Processing'));
    const newWorkspaceConfig = workspaceConfigFromForm(form, isCreateMainWorkspace, isCreateSyncedWorkspace);
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
      await window.service.wikiGitWorkspace.initWikiGitTransaction(newWorkspaceConfig);
      // wait for wiki to start and close the window now.
      await window.remote.closeCurrentWindow();
    } catch (error) {
      wikiCreationMessageSetter((error as Error).message);
      hasErrorSetter(true);
    }
  }, [form, wikiCreationMessageSetter, t, isCreateMainWorkspace, isCreateSyncedWorkspace, hasErrorSetter]);

  return onSubmit;
}
