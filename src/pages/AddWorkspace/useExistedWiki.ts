/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { WikiCreationMethod } from '@/constants/wikiCreation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { callWikiInitialization } from './useCallWikiInitialization';
import { IErrorInWhichComponent, IWikiWorkspaceForm, workspaceConfigFromForm } from './useForm';
import { updateErrorInWhichComponentSetterByErrorMessage } from './useIndicator';

export function useValidateExistedWiki(
  isCreateMainWorkspace: boolean,
  isCreateSyncedWorkspace: boolean,
  form: IWikiWorkspaceForm,
  errorInWhichComponentSetter: (errors: IErrorInWhichComponent) => void,
): [boolean, string | undefined, (m: string) => void, (m: boolean) => void] {
  const { t } = useTranslation();
  const [wikiCreationMessage, wikiCreationMessageSetter] = useState<string | undefined>();
  const [hasError, hasErrorSetter] = useState<boolean>(false);
  useEffect(() => {
    if (!form.wikiFolderLocation) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.ExistedWikiLocation')}`);
      errorInWhichComponentSetter({ wikiFolderLocation: true });
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
    form.wikiFolderLocation,
    form.wikiFolderName,
    form.gitRepoUrl,
    form.gitUserInfo,
    form.mainWikiToLink?.wikiFolderLocation,
    form.tagName,
    errorInWhichComponentSetter,
  ]);
  return [hasError, wikiCreationMessage, wikiCreationMessageSetter, hasErrorSetter];
}
export function useExistedWiki(
  isCreateMainWorkspace: boolean,
  isCreateSyncedWorkspace: boolean,
  form: IWikiWorkspaceForm,
  wikiCreationMessageSetter: (m: string) => void,
  hasErrorSetter: (m: boolean) => void,
  errorInWhichComponentSetter: (errors: IErrorInWhichComponent) => void,
): () => Promise<void> {
  const { t } = useTranslation();

  const onSubmit = useCallback(async () => {
    wikiCreationMessageSetter(t('AddWorkspace.Processing'));
    const newWorkspaceConfig = await workspaceConfigFromForm(form, isCreateMainWorkspace, isCreateSyncedWorkspace);
    if (!form.wikiFolderLocation) {
      throw new Error(t('AddWorkspace.MainWorkspaceLocation') + t('AddWorkspace.NotFilled'));
    }
    try {
      if (isCreateMainWorkspace) {
        await window.service.wiki.ensureWikiExist(form.wikiFolderLocation, true);
      } else {
        const wikiFolderNameForExistedFolder = await window.service.native.path('basename', form.wikiFolderLocation);
        const parentFolderLocationForExistedFolder = await window.service.native.path('dirname', form.wikiFolderLocation);
        if (!wikiFolderNameForExistedFolder || !parentFolderLocationForExistedFolder) {
          throw new Error(
            `Undefined folder name: parentFolderLocationForExistedFolder: ${parentFolderLocationForExistedFolder ?? '-'}, parentFolderLocationForExistedFolder: ${
              parentFolderLocationForExistedFolder ?? '-'
            }`,
          );
        }
        await window.service.wiki.ensureWikiExist(form.wikiFolderLocation, false);
        await window.service.wiki.createSubWiki(
          parentFolderLocationForExistedFolder,
          wikiFolderNameForExistedFolder,
          form.mainWikiToLink?.wikiFolderLocation,
          form.tagName,
          true,
        );
      }
      await callWikiInitialization(newWorkspaceConfig, wikiCreationMessageSetter, t, form.gitUserInfo, { from: WikiCreationMethod.LoadExisting });
    } catch (error) {
      wikiCreationMessageSetter((error as Error).message);
      updateErrorInWhichComponentSetterByErrorMessage(t, (error as Error).message, errorInWhichComponentSetter);
      hasErrorSetter(true);
    }
  }, [wikiCreationMessageSetter, t, form, isCreateMainWorkspace, isCreateSyncedWorkspace, errorInWhichComponentSetter, hasErrorSetter]);

  return onSubmit;
}
