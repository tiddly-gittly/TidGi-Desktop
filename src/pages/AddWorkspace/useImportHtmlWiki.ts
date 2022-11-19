/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IErrorInWhichComponent, IWikiWorkspaceForm } from './useForm';
import { updateErrorInWhichComponentSetterByErrorMessage } from './useIndicator';
import { useValidateNewWiki, useNewWiki } from './useNewWiki';

export function useValidateHtmlWiki(
  isCreateMainWorkspace: boolean,
  isCreateSyncedWorkspace: boolean,
  form: IWikiWorkspaceForm,
  errorInWhichComponentSetter: (errors: IErrorInWhichComponent) => void,
): [boolean, string | undefined, (m: string) => void, (m: boolean) => void] {
  const { t } = useTranslation();
  const [wikiCreationMessage, wikiCreationMessageSetter] = useState<string | undefined>();
  const [hasError, hasErrorSetter] = useState<boolean>(false);
  useValidateNewWiki(isCreateMainWorkspace, isCreateSyncedWorkspace, form, errorInWhichComponentSetter);
  useEffect(() => {
    if (!form.wikiHtmlPath) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.LocalWikiHtml')}`);
      errorInWhichComponentSetter({ wikiHtmlPath: true });
      hasErrorSetter(true);
    } else {
      wikiCreationMessageSetter('');
      errorInWhichComponentSetter({});
      hasErrorSetter(false);
    }
  }, [t, form.wikiHtmlPath, form.parentFolderLocation, form.wikiFolderName, errorInWhichComponentSetter]);

  return [hasError, wikiCreationMessage, wikiCreationMessageSetter, hasErrorSetter];
}

export function useImportHtmlWiki(
  isCreateMainWorkspace: boolean,
  isCreateSyncedWorkspace: boolean,
  form: IWikiWorkspaceForm,
  wikiCreationMessageSetter: (m: string) => void,
  hasErrorSetter: (m: boolean) => void,
  errorInWhichComponentSetter: (errors: IErrorInWhichComponent) => void,
): () => Promise<void> {
  const { t } = useTranslation();

  const createNewWikiSubmit = useNewWiki(
    isCreateMainWorkspace,
    isCreateSyncedWorkspace,
    form,
    wikiCreationMessageSetter,
    hasErrorSetter,
    errorInWhichComponentSetter,
    { noCopyTemplate: true },
  );

  const onSubmit = useCallback(async () => {
    const { wikiFolderLocation, wikiHtmlPath } = form;
    if (wikiFolderLocation === undefined) {
      hasErrorSetter(true);
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.WorkspaceFolder')}`);
      errorInWhichComponentSetter({ parentFolderLocation: true });
      return;
    }
    wikiCreationMessageSetter(t('AddWorkspace.Processing'));
    try {
      const extractSuccess = await window.service.wiki.extractWikiHTML(wikiHtmlPath, wikiFolderLocation);
      if (extractSuccess === false) {
        hasErrorSetter(true);
        wikiCreationMessageSetter(t('AddWorkspace.BadWikiHtml'));
        errorInWhichComponentSetter({ wikiHtmlPath: true });
        return;
      } else if (typeof extractSuccess === 'string') {
        updateErrorInWhichComponentSetterByErrorMessage(t, extractSuccess, errorInWhichComponentSetter);
      }
    } catch (error) {
      wikiCreationMessageSetter(`${t('AddWorkspace.BadWikiHtml')}${(error as Error).message}`);
      errorInWhichComponentSetter({ wikiHtmlPath: true });
      hasErrorSetter(true);
      return;
    }
    await createNewWikiSubmit();
  }, [form, wikiCreationMessageSetter, t, createNewWikiSubmit, hasErrorSetter, errorInWhichComponentSetter]);

  return onSubmit;
}
