/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { WikiCreationMethod } from '@/constants/wikiCreation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { callWikiInitialization } from './useCallWikiInitialization';
import { IErrorInWhichComponent, IWikiWorkspaceForm, workspaceConfigFromForm } from './useForm';
import { updateErrorInWhichComponentSetterByErrorMessage } from './useIndicator';

export function useValidateCloneWiki(
  isCreateMainWorkspace: boolean,
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
    } else if (!form.gitRepoUrl) {
      errorInWhichComponentSetter({ gitRepoUrl: true });
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.GitRepoUrl')}`);
      hasErrorSetter(true);
    } else if (!isCreateMainWorkspace && !form.mainWikiToLink?.wikiFolderLocation) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.MainWorkspace')}`);
      errorInWhichComponentSetter({ mainWikiToLink: true });
      hasErrorSetter(true);
    } else if (form.gitUserInfo === undefined || !(form.gitUserInfo.accessToken?.length > 0)) {
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

export function useCloneWiki(
  isCreateMainWorkspace: boolean,
  form: IWikiWorkspaceForm,
  wikiCreationMessageSetter: (m: string) => void,
  hasErrorSetter: (m: boolean) => void,
  errorInWhichComponentSetter: (errors: IErrorInWhichComponent) => void,
): () => Promise<void> {
  const { t } = useTranslation();

  const onSubmit = useCallback(async () => {
    wikiCreationMessageSetter(t('AddWorkspace.Processing'));
    try {
      const newWorkspaceConfig = await workspaceConfigFromForm(form, isCreateMainWorkspace, true);
      if (isCreateMainWorkspace) {
        await window.service.wiki.cloneWiki(form.parentFolderLocation, form.wikiFolderName, form.gitRepoUrl, form.gitUserInfo!);
      } else {
        await window.service.wiki.cloneSubWiki(
          form.parentFolderLocation,
          form.wikiFolderName,
          form.mainWikiToLink.wikiFolderLocation,
          form.gitRepoUrl,
          form.gitUserInfo!,
          form.tagName,
        );
      }
      await callWikiInitialization(newWorkspaceConfig, wikiCreationMessageSetter, t, form.gitUserInfo, { from: WikiCreationMethod.Clone });
    } catch (error) {
      wikiCreationMessageSetter((error as Error).message);
      updateErrorInWhichComponentSetterByErrorMessage(t, (error as Error).message, errorInWhichComponentSetter);
      hasErrorSetter(true);
    }
  }, [wikiCreationMessageSetter, t, form, isCreateMainWorkspace, errorInWhichComponentSetter, hasErrorSetter]);

  return onSubmit;
}
