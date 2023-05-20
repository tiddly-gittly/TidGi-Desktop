/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { WikiCreationMethod } from '@/constants/wikiCreation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConditionalExcept } from 'type-fest';
import { callWikiInitialization } from './useCallWikiInitialization';
import { IErrorInWhichComponent, IWikiWorkspaceForm, workspaceConfigFromForm } from './useForm';
import { updateErrorInWhichComponentSetterByErrorMessage } from './useIndicator';

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

export type INewWikiRequiredFormData = ConditionalExcept<IWikiWorkspaceForm, Function>;
export function useNewWiki(
  isCreateMainWorkspace: boolean,
  isCreateSyncedWorkspace: boolean,
  form: INewWikiRequiredFormData,
  wikiCreationMessageSetter: (m: string) => void,
  hasErrorSetter?: (m: boolean) => void,
  errorInWhichComponentSetter?: (errors: IErrorInWhichComponent) => void,
  options?: { noCopyTemplate?: boolean; notClose?: boolean },
): () => Promise<void> {
  const { t } = useTranslation();

  const onSubmit = useCallback(async () => {
    wikiCreationMessageSetter(t('AddWorkspace.Processing'));
    hasErrorSetter?.(false);
    try {
      const newWorkspaceConfig = await workspaceConfigFromForm(form, isCreateMainWorkspace, isCreateSyncedWorkspace);
      if (isCreateMainWorkspace) {
        if (options?.noCopyTemplate !== true) {
          await window.service.wiki.copyWikiTemplate(form.parentFolderLocation, form.wikiFolderName);
        }
      } else {
        await window.service.wiki.createSubWiki(form.parentFolderLocation, form.wikiFolderName, form.mainWikiToLink?.wikiFolderLocation, form.tagName);
      }
      await callWikiInitialization(newWorkspaceConfig, wikiCreationMessageSetter, t, form.gitUserInfo, { notClose: options?.notClose, from: WikiCreationMethod.Create });
    } catch (error) {
      wikiCreationMessageSetter((error as Error).message);
      errorInWhichComponentSetter && updateErrorInWhichComponentSetterByErrorMessage(t, (error as Error).message, errorInWhichComponentSetter);
      hasErrorSetter?.(true);
    }
  }, [wikiCreationMessageSetter, t, hasErrorSetter, form, isCreateMainWorkspace, isCreateSyncedWorkspace, options, errorInWhichComponentSetter]);

  return onSubmit;
}
