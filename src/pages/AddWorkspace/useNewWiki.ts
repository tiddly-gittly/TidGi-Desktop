/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IErrorInWhichComponent, IWikiWorkspaceForm, workspaceConfigFromForm } from './useForm';

export function useValidateNewWiki(
  isCreateMainWorkspace: boolean,
  isCreateSyncedWorkspace: boolean,
  form: IWikiWorkspaceForm,
  errorInWhichComponentSetter: (errors: IErrorInWhichComponent) => void,
): [boolean, string | undefined, (m: string) => void, (m: boolean) => void] {
  const { t } = useTranslation();
  const [wikiCreationMessage, wikiCreationMessageSetter] = useState<string | undefined>();
  const [hasError, hasErrorSetter] = useState<boolean>(false);
  useEffect(() => {
    if (!form.parentFolderLocation) {
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
      wikiCreationMessageSetter('');
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
    errorInWhichComponentSetter,
  ]);

  return [hasError, wikiCreationMessage, wikiCreationMessageSetter, hasErrorSetter];
}

export function useNewWiki(
  isCreateMainWorkspace: boolean,
  isCreateSyncedWorkspace: boolean,
  form: IWikiWorkspaceForm,
  wikiCreationMessageSetter: (m: string) => void,
  hasErrorSetter: (m: boolean) => void,
): () => Promise<void> {
  const { t } = useTranslation();

  const onSubmit = useCallback(async () => {
    wikiCreationMessageSetter(t('AddWorkspace.Processing'));
    hasErrorSetter(false);
    try {
      const newWorkspaceConfig = workspaceConfigFromForm(form, isCreateMainWorkspace, isCreateSyncedWorkspace);
      if (isCreateMainWorkspace) {
        await window.service.wiki.copyWikiTemplate(form.parentFolderLocation, form.wikiFolderName);
      } else {
        await window.service.wiki.createSubWiki(form.parentFolderLocation, form.wikiFolderName, form.mainWikiToLink?.wikiFolderLocation, form.tagName);
      }
      const newWorkspace = await window.service.wikiGitWorkspace.initWikiGitTransaction(newWorkspaceConfig, form.gitUserInfo);
      if (newWorkspace === undefined) {
        throw new Error('newWorkspace is undefined');
      }
      // start wiki on startup, or on sub-wiki creation
      await window.service.workspaceView.initializeWorkspaceView(newWorkspace);
      // wait for wiki to start and close the window now.
      await window.remote.closeCurrentWindow();
    } catch (error) {
      wikiCreationMessageSetter((error as Error).message);
      hasErrorSetter(true);
    }
  }, [form, wikiCreationMessageSetter, t, hasErrorSetter, isCreateMainWorkspace, isCreateSyncedWorkspace]);

  return onSubmit;
}
