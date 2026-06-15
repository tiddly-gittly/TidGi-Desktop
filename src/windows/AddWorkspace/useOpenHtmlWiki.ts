import { WikiCreationMethod } from '@/constants/wikiCreation';
import { SupportedStorageServices } from '@services/types';
import { type INewHtmlWikiWorkspaceConfig, WorkspaceType } from '@services/workspaces/interface';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { callWikiInitialization } from './useCallWikiInitialization';
import type { IErrorInWhichComponent, IWikiWorkspaceForm } from './useForm';
import { workspaceConfigFromForm } from './useForm';

export function useValidateOpenHtmlWiki(
  form: IWikiWorkspaceForm,
  errorInWhichComponentSetter: (errors: IErrorInWhichComponent) => void,
): [boolean, string | undefined, (m: string) => void, (m: boolean) => void] {
  const { t } = useTranslation();
  const [wikiCreationMessage, wikiCreationMessageSetter] = useState<string | undefined>();
  const [hasError, hasErrorSetter] = useState<boolean>(false);

  useEffect(() => {
    if (!form.wikiHtmlPath) {
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.LocalWikiHtml')}`);
      errorInWhichComponentSetter({ wikiHtmlPath: true });
      hasErrorSetter(true);
      return;
    }
    wikiCreationMessageSetter('');
    errorInWhichComponentSetter({});
    hasErrorSetter(false);
  }, [t, form.wikiHtmlPath, errorInWhichComponentSetter]);

  return [hasError, wikiCreationMessage, wikiCreationMessageSetter, hasErrorSetter];
}

export function useOpenHtmlWiki(
  form: IWikiWorkspaceForm,
  wikiCreationMessageSetter: (m: string) => void,
  hasErrorSetter: (m: boolean) => void,
  errorInWhichComponentSetter: (errors: IErrorInWhichComponent) => void,
): () => Promise<void> {
  const { t } = useTranslation();

  return useCallback(async () => {
    const { wikiHtmlPath, wikiFolderName, wikiPort, gitRepoUrl } = form;
    if (!wikiHtmlPath) {
      hasErrorSetter(true);
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.LocalWikiHtml')}`);
      errorInWhichComponentSetter({ wikiHtmlPath: true });
      return;
    }
    wikiCreationMessageSetter(t('AddWorkspace.Processing'));
    try {
      await window.service.htmlWiki.validateHtmlFile(wikiHtmlPath);
    } catch (error) {
      hasErrorSetter(true);
      wikiCreationMessageSetter(`${t('AddWorkspace.BadWikiHtml')}${(error as Error).message}`);
      errorInWhichComponentSetter({ wikiHtmlPath: true });
      return;
    }
    const parentFolder = await window.service.native.path('dirname', wikiHtmlPath);
    const baseName = await window.service.native.path('basename', wikiHtmlPath);
    const defaultName = baseName?.replace(/\.(html|htm)$/i, '') ?? wikiFolderName;
    const isSynced = form.storageProvider !== SupportedStorageServices.local;
    const baseConfig = workspaceConfigFromForm(
      {
        ...form,
        wikiFolderLocation: parentFolder ?? wikiHtmlPath,
        wikiFolderName: wikiFolderName || defaultName,
      },
      true,
      isSynced,
    );
    const newWorkspaceConfig: INewHtmlWikiWorkspaceConfig = {
      ...baseConfig,
      workspaceType: WorkspaceType.html,
      htmlFileLocation: wikiHtmlPath,
      useTidgiConfig: false,
      isSubWiki: false,
      gitUrl: isSynced ? gitRepoUrl : null,
      port: wikiPort,
    };
    await callWikiInitialization(newWorkspaceConfig, wikiCreationMessageSetter, t, form.gitUserInfo, {
      from: WikiCreationMethod.OpenHtmlWikiFile,
    });
  }, [form, wikiCreationMessageSetter, hasErrorSetter, errorInWhichComponentSetter, t]);
}
