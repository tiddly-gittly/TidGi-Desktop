/* eslint-disable unicorn/no-null */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePromiseValue } from '@/helpers/useServiceValue';
import { useStorageServiceUserInfoObservable } from '@services/auth/hooks';
import { SupportedStorageServices } from '@services/types';
import { ISubWikiPluginContent } from '@services/wiki/plugin/subWikiPlugin';
import { INewWorkspaceConfig, IWorkspace } from '@services/workspaces/interface';

export function useIsCreateSyncedWorkspace(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [isCreateSyncedWorkspace, isCreateSyncedWorkspaceSetter] = useState(false);
  useEffect(() => {
    void window.service.auth.getRandomStorageServiceUserInfo().then((result) => isCreateSyncedWorkspaceSetter(result !== undefined));
  }, []);
  return [isCreateSyncedWorkspace, isCreateSyncedWorkspaceSetter];
}

export function useWikiWorkspaceForm(options?: { fromExisted: boolean }) {
  const { t } = useTranslation();

  const workspaceList = usePromiseValue(async () => await window.service.workspace.getWorkspacesAsList()) ?? [];

  const [wikiPort, wikiPortSetter] = useState(5212);
  useEffect(() => {
    // only update default port on component mount
    void window.service.workspace.countWorkspaces().then((workspaceCount) => wikiPortSetter(wikiPort + workspaceCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Set storage service used by this workspace, for example, Github.
   */
  const [storageProvider, storageProviderSetter] = useState<SupportedStorageServices>(SupportedStorageServices.local);
  const gitUserInfo = useStorageServiceUserInfoObservable(storageProvider);

  /**
   * For sub-wiki, we need to link it to a main wiki's folder, so all wiki contents can be loaded together.
   */
  const mainWorkspaceList = workspaceList.filter((workspace) => !workspace.isSubWiki);
  const [mainWikiToLink, mainWikiToLinkSetter] = useState<Pick<IWorkspace, 'wikiFolderLocation' | 'port' | 'id'>>(
    mainWorkspaceList[0] ?? { wikiFolderLocation: '', port: 0, id: '' },
  );
  const [tagName, tagNameSetter] = useState<string>('');
  let mainWikiToLinkIndex = mainWorkspaceList.findIndex((workspace) => workspace.id === mainWikiToLink.id);
  if (mainWikiToLinkIndex < 0) {
    mainWikiToLinkIndex = 0;
  }
  useEffect(() => {
    if (mainWorkspaceList[mainWikiToLinkIndex]?.wikiFolderLocation) {
      mainWikiToLinkSetter(mainWorkspaceList[mainWikiToLinkIndex]);
    }
  }, [mainWorkspaceList, mainWikiToLinkIndex]);
  /**
   * For sub-wiki, we need `fileSystemPaths` which is a TiddlyWiki concept that tells wiki where to put sub-wiki files.
   */
  const [fileSystemPaths, fileSystemPathsSetter] = useState<ISubWikiPluginContent[]>([]);
  useEffect(() => {
    void window.service.wiki.getSubWikiPluginContent(mainWikiToLink.wikiFolderLocation).then(fileSystemPathsSetter);
  }, [mainWikiToLink]);
  /**
   * For creating new wiki, we use parentFolderLocation to determine in which folder we create the new wiki folder.
   * New folder will basically be created in `${parentFolderLocation}/${wikiFolderName}`
   */
  const [parentFolderLocation, parentFolderLocationSetter] = useState<string>('');
  /**
   * For creating new wiki, we put `tiddlers` folder in this `${parentFolderLocation}/${wikiFolderName}` folder
   */
  const [wikiFolderName, wikiFolderNameSetter] = useState('tiddlywiki');

  /**
   * Initialize a folder path for user
   */
  useEffect(() => {
    void (async function getDefaultExistedWikiFolderPathEffect() {
      const desktopPathAsDefaultExistedWikiFolderPath = await window.service.context.get('DEFAULT_WIKI_FOLDER');
      wikiFolderNameSetter(mainWorkspaceList[mainWorkspaceList.length - 1]?.wikiFolderLocation ?? 'wiki');
      parentFolderLocationSetter(desktopPathAsDefaultExistedWikiFolderPath);
    })();
    // we only do this on component init
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [gitRepoUrl, gitRepoUrlSetter] = useState<string>('');

  // derived values

  const wikiFolderLocation = usePromiseValue(() => window.service.native.path('join', parentFolderLocation ?? t('Error') ?? 'Error', wikiFolderName), 'Error', [
    parentFolderLocation,
    wikiFolderName,
  ]);

  /**
   * For importing existed nodejs wiki into TidGi, we parse git url from the folder to import
   */
  useEffect(() => {
    void (async function getWorkspaceRemoteEffect(): Promise<void> {
      if (options?.fromExisted) {
        const url = await window.service.git.getWorkspacesRemote(wikiFolderLocation);
        if (typeof url === 'string' && url.length > 0) {
          gitRepoUrlSetter(url);
        }
      }
    })();
  }, [gitRepoUrlSetter, wikiFolderLocation, options?.fromExisted]);

   /*
   * 对于wikiHTML,我们使用两个状态保存文件与wiki解压父文件夹路径,并设置默认的wiki文件夹保存位置.
   * wikiHtmlPath、wikiHtmlPathSetter、extractWikiHtmlParentFolder、extractWikiHtmlParentFolderSetter,
   */
   const [wikiHtmlPath, wikiHtmlPathSetter] = useState<string>('');
   useEffect(() => {
     void (async function getDefaultWikiHtmlPathEffect() {})();
   }, []);
 
   const [extractWikiHtmlParentFolder, extractWikiHtmlParentFolderSetter] = useState<string>('');
   useEffect(() => {
     void (async function getDefaultExtractWikiHtmlFolderPathEffect() {
       const desktopPathAsDefaultExtractWikiHtmlParentFolderPath = await window.service.context.get('DEFAULT_WIKI_FOLDER');
       extractWikiHtmlParentFolderSetter(desktopPathAsDefaultExtractWikiHtmlParentFolderPath);
     })();
   }, []);

  return {
    storageProvider,
    storageProviderSetter,
    wikiPort,
    wikiPortSetter,
    mainWikiToLink,
    mainWikiToLinkSetter,
    tagName,
    tagNameSetter,
    fileSystemPaths,
    fileSystemPathsSetter,
    gitRepoUrl,
    gitRepoUrlSetter,
    parentFolderLocation,
    parentFolderLocationSetter,
    wikiFolderName,
    wikiFolderNameSetter,
    gitUserInfo,
    wikiFolderLocation,
    workspaceList,
    mainWorkspaceList,
    mainWikiToLinkIndex,
    wikiHtmlPath,
    wikiHtmlPathSetter,
    extractWikiHtmlParentFolder,
    extractWikiHtmlParentFolderSetter,
  };
}

export type IWikiWorkspaceForm = ReturnType<typeof useWikiWorkspaceForm>;
export type IErrorInWhichComponent = Partial<Record<keyof IWikiWorkspaceForm, boolean>>;
export interface IWikiWorkspaceFormProps {
  errorInWhichComponent: IErrorInWhichComponent;
  errorInWhichComponentSetter: (errors: IErrorInWhichComponent) => void;
  form: IWikiWorkspaceForm;
  isCreateMainWorkspace: boolean;
}

export function workspaceConfigFromForm(form: IWikiWorkspaceForm, isCreateMainWorkspace: boolean, isCreateSyncedWorkspace: boolean): INewWorkspaceConfig {
  return {
    gitUrl: isCreateSyncedWorkspace ? form.gitRepoUrl : null,
    isSubWiki: !isCreateMainWorkspace,
    mainWikiToLink: !isCreateMainWorkspace ? form.mainWikiToLink.wikiFolderLocation : null,
    mainWikiID: !isCreateMainWorkspace ? form.mainWikiToLink.id : null,
    name: form.wikiFolderName,
    storageService: form.storageProvider,
    tagName: !isCreateMainWorkspace ? form.tagName : null,
    port: form.wikiPort,
    wikiFolderLocation: form.wikiFolderLocation!,
    backupOnInterval: true,
  };
}
