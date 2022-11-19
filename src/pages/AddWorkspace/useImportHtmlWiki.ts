/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IErrorInWhichComponent, IWikiWorkspaceForm } from './useForm';
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
      // 判断wikiHtmlPath是否存在
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.LocalWikiHtml')}`);
      errorInWhichComponentSetter({ wikiHtmlPath: true });
      hasErrorSetter(true);
    }
  }, [
    t,
    // 监听wikiHtmlPath，如果不存在就在提示用户。
    form.wikiHtmlPath,
    errorInWhichComponentSetter,
  ]);

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
      // 如果是HTML文件，即使转换错误，删掉在执行一次也不会出错。
      // 我希望判断用户输入的是否是HTML文件，如果不是就不予执行。然后在判断如果失败了就删除这个数据并且提示错误信息。如果输入的是html类型的文件是不会出错的，即使是非wiki类型的文件。如果输出的目录非空，那么会导致异常闪退。
      const extractState = await window.service.wiki.extractWikiHTML(wikiHtmlPath, wikiFolderLocation);
      if (!extractState) {
        hasErrorSetter(true);
        wikiCreationMessageSetter(t('AddWorkspace.BadWikiHtml'));
        errorInWhichComponentSetter({ wikiHtmlPath: true });
        return;
      }
      // 我希望在解压成功后设置好工作区的信息，执行打开解压后的wiki文件夹的操作。
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
