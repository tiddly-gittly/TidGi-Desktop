// ...existing code...
import { useEffect, useMemo, useState } from 'react';

import { usePromiseValue } from '@/helpers/useServiceValue';
import { useStorageServiceUserInfoObservable } from '@services/auth/hooks';
import { SupportedStorageServices } from '@services/types';
import type { INewWikiWorkspaceConfig, IWikiWorkspace } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { ISyncableWikiConfig } from '@services/workspaces/syncableConfig';
import type { INewWikiRequiredFormData } from './useNewWiki';

type IMainWikiInfo = Pick<IWikiWorkspace, 'wikiFolderLocation' | 'port' | 'id'>;

export function useIsCreateSyncedWorkspace(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [isCreateSyncedWorkspace, isCreateSyncedWorkspaceSetter] = useState(false);
  useEffect(() => {
    void window.service.auth.getRandomStorageServiceUserInfo().then((result) => {
      isCreateSyncedWorkspaceSetter(result !== undefined);
    });
  }, []);
  return [isCreateSyncedWorkspace, isCreateSyncedWorkspaceSetter];
}

export function useWikiWorkspaceForm(options?: { fromExisted: boolean }) {
  const workspaceList = usePromiseValue(async () => await window.service.workspace.getWorkspacesAsList(), []);

  const [wikiPort, wikiPortSetter] = useState(5212);
  useEffect(() => {
    // only update default port on component mount
    void window.service.workspace.countWorkspaces().then((workspaceCount) => {
      wikiPortSetter(wikiPort + workspaceCount);
    });
  }, []);

  /**
   * Set storage service used by this workspace, for example, Github.
   */
  const [storageProvider, storageProviderSetter] = useState<SupportedStorageServices>(SupportedStorageServices.local);
  const gitUserInfo = useStorageServiceUserInfoObservable(storageProvider);

  /**
   * For sub-wiki, we need to link it to a main wiki's folder, so all wiki contents can be loaded together.
   */
  const mainWorkspaceList = useMemo(() => workspaceList?.filter((workspace) => isWikiWorkspace(workspace) && !workspace.isSubWiki) ?? [], [workspaceList]);
  const [mainWikiToLink, mainWikiToLinkSetter] = useState<IMainWikiInfo>(
    () => {
      const firstMainWiki = mainWorkspaceList.find(isWikiWorkspace);
      return firstMainWiki ? { wikiFolderLocation: firstMainWiki.wikiFolderLocation, port: firstMainWiki.port, id: firstMainWiki.id } : { wikiFolderLocation: '', port: 0, id: '' };
    },
  );
  const [tagNames, tagNamesSetter] = useState<string[]>([]);
  let mainWikiToLinkIndex = mainWorkspaceList.findIndex((workspace) => workspace.id === mainWikiToLink.id);
  if (mainWikiToLinkIndex < 0) {
    mainWikiToLinkIndex = 0;
  }
  useEffect(() => {
    const selectedWorkspace = mainWorkspaceList[mainWikiToLinkIndex];
    if (selectedWorkspace && isWikiWorkspace(selectedWorkspace) && selectedWorkspace.wikiFolderLocation) {
      mainWikiToLinkSetter({ wikiFolderLocation: selectedWorkspace.wikiFolderLocation, port: selectedWorkspace.port, id: selectedWorkspace.id });
    }
  }, [mainWorkspaceList, mainWikiToLinkIndex]);
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
      const desktopPathAsDefaultExistedWikiFolderPath = await window.service.context.get('DEFAULT_FIRST_WIKI_FOLDER_PATH');
      const lastMainWiki = mainWorkspaceList.at(-1);
      const defaultWikiFolderName = (lastMainWiki && isWikiWorkspace(lastMainWiki)) ? lastMainWiki.wikiFolderLocation : 'wiki';
      wikiFolderNameSetter(defaultWikiFolderName);
      parentFolderLocationSetter(desktopPathAsDefaultExistedWikiFolderPath);
    })();
    // we only do this on component init
  }, []);
  const [gitRepoUrl, gitRepoUrlSetter] = useState<string>('');

  // derived values

  /** full path of created wiki folder */
  const wikiFolderLocation = usePromiseValue(
    async () => await window.service.native.path('join', parentFolderLocation, wikiFolderName),
    '',
    [parentFolderLocation, wikiFolderName],
  );

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
   * For wikiHTML
   */
  const [wikiHtmlPath, wikiHtmlPathSetter] = useState<string>('');
  useEffect(() => {
    void (async function getDefaultWikiHtmlPathEffect() {})();
  }, []);

  /**
   * Ancestor Git repo detection: when creating a wiki inside an already-versioned folder (e.g. a
   * game project), we offer to use the outer repo instead of creating a nested one. Holds the list
   * of ancestor repo roots (nearest first) and the user's choice.
   */
  const [ancestorGitRepos, ancestorGitReposSetter] = useState<string[]>([]);
  const [useOuterGitRepo, useOuterGitRepoSetter] = useState<boolean>(true);
  const [selectedAncestorRepoIndex, selectedAncestorRepoIndexSetter] = useState<number>(0);
  useEffect(() => {
    void (async function detectAncestorGitReposEffect(): Promise<void> {
      if (!parentFolderLocation) {
        ancestorGitReposSetter([]);
        return;
      }
      try {
        const repos = await window.service.git.discoverAncestorGitRepos(parentFolderLocation);
        ancestorGitReposSetter(repos);
        // Default to using the nearest ancestor repo when one is detected.
        useOuterGitRepoSetter(repos.length > 0);
        selectedAncestorRepoIndexSetter(0);
      } catch {
        ancestorGitReposSetter([]);
      }
    })();
  }, [parentFolderLocation]);
  return {
    storageProvider,
    storageProviderSetter,
    wikiPort,
    wikiPortSetter,
    mainWikiToLink,
    mainWikiToLinkSetter,
    tagNames,
    tagNamesSetter,
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
    ancestorGitRepos,
    useOuterGitRepo,
    useOuterGitRepoSetter,
    selectedAncestorRepoIndex,
    selectedAncestorRepoIndexSetter,
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

/**
 * Fill in default value for newly created wiki.
 * @param form New wiki form value
 */
export async function workspaceConfigFromForm(
  form: INewWikiRequiredFormData,
  isCreateMainWorkspace: boolean,
  isCreateSyncedWorkspace: boolean,
  options?: { useTidgiConfig?: boolean; selectedImportConfig?: Partial<ISyncableWikiConfig> },
): Promise<INewWikiWorkspaceConfig> {
  // For local folder wikis created inside an ancestor Git repo, scope Git to the wiki subfolder of
  // that outer repo instead of initializing a nested repo. Synced wikis keep their own repo. The
  // portable relative paths are computed in the main process via IPC so the renderer does no path math.
  let gitRepoPath: string | null = null;
  let gitManagedRelativePath: string | null = null;
  if (!isCreateSyncedWorkspace && form.useOuterGitRepo && form.ancestorGitRepos.length > 0) {
    const chosenRepoRoot = form.ancestorGitRepos[form.selectedAncestorRepoIndex] ?? form.ancestorGitRepos[0];
    if (form.wikiFolderLocation && chosenRepoRoot) {
      const scope = await window.service.git.computeGitScopePaths(form.wikiFolderLocation, chosenRepoRoot);
      gitRepoPath = scope.gitRepoPath;
      gitManagedRelativePath = scope.gitManagedRelativePath;
    }
  }
  return {
    gitUrl: isCreateSyncedWorkspace ? form.gitRepoUrl : null,
    isSubWiki: !isCreateMainWorkspace,
    mainWikiToLink: isCreateMainWorkspace ? null : form.mainWikiToLink.wikiFolderLocation,
    mainWikiID: isCreateMainWorkspace ? null : form.mainWikiToLink.id,
    name: form.wikiFolderName,
    storageService: form.storageProvider,
    tagNames: isCreateMainWorkspace ? [] : form.tagNames,
    port: form.wikiPort,
    wikiFolderLocation: form.wikiFolderLocation!,
    readOnlyMode: false,
    tokenAuth: false,
    enableFileSystemWatch: false,
    useTidgiConfig: options?.useTidgiConfig,
    gitRepoPath,
    gitManagedRelativePath,
    ...(options?.selectedImportConfig as Partial<INewWikiWorkspaceConfig> | undefined),
    // Additional fields will be set with default values in `sanitizeWorkspace`, see also `INewWikiWorkspaceConfig`
  };
}
