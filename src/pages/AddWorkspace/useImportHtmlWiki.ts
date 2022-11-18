/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IErrorInWhichComponent, IWikiWorkspaceForm } from './useForm';
import { updateErrorInWhichComponentSetterByErrorMessage } from './useIndicator';

export function useValidateHtmlWiki(
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
    } else if (!form.wikiHtmlPath) {
      // 判断wikiHtmlPath是否存在
      wikiCreationMessageSetter(`${t('AddWorkspace.NotFilled')}：${t('AddWorkspace.LocalWikiHtml')}`);
      errorInWhichComponentSetter({ wikiHtmlPath: true });
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

  const onSubmit = useCallback(async () => {
    wikiCreationMessageSetter(t('AddWorkspace.Processing'));
    hasErrorSetter(false);
    try {
      // 如果是HTML文件，即使转换错误，删掉在执行一次也不会出错。
      // 我希望判断用户输入的是否是HTML文件，如果不是就不予执行。然后在判断如果失败了就删除这个数据并且提示错误信息。如果输入的是html类型的文件是不会出错的，即使是非wiki类型的文件。如果输出的目录非空，那么会导致异常闪退。
      // 我希望，可以创建一个与HTML文件名一样的文件夹，这样的话就可以在父文件夹中解压出一个HTML文件名一样的文件夹而不只是wiki数据。
      // 我希望信息可以显示在log面板。当出现解压错误后就提示用户。
      const extractState = await window.service.wiki.extractWikiHTML(form.wikiHtmlPath, form.extractWikiHtmlParentFolder);
      // 待解决： var extractState用于接收执行是否解压是否成功。但是接收不到window.service.wiki.extractWikiHTML函数的返回值，并且在该函数上下打log都未显示。
      // 我希望在解压成功后设置好工作区的信息，执行打开解压后的wiki文件夹的操作。
    } catch (error) {
      wikiCreationMessageSetter((error as Error).message);
      updateErrorInWhichComponentSetterByErrorMessage(t, (error as Error).message, errorInWhichComponentSetter);
      hasErrorSetter(true);
    }
  }, [
    wikiCreationMessageSetter,
    t,
    hasErrorSetter,
    form,
    isCreateMainWorkspace,
    isCreateSyncedWorkspace,
    form.wikiHtmlPath,
    form.extractWikiHtmlParentFolder,
    errorInWhichComponentSetter,
  ]);

  return onSubmit;
}
