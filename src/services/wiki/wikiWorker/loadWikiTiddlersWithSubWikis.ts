import type { IWikiWorkspace } from '@services/workspaces/interface';
import { workspaceSorter } from '@services/workspaces/utilities';
import path from 'node:path';
import type { TiddlyWiki } from 'tiddlywiki';

interface IDynamicStoreSpecification {
  externalAttachments: {
    basePath: string;
    moveOnRoute: boolean;
    pathPrefix: string;
  };
  followSymlinks: boolean;
  ignoredPathRegExp: string;
  reselectOnSave: boolean;
  saveFilter: string;
  watch: boolean;
  watcherProvider: string;
}

interface IDirectorySpecification {
  dynamicStore: IDynamicStoreSpecification;
  filesRegExp: string;
  isEditableFile: boolean;
  isTiddlerFile: boolean;
  path: string;
  searchSubdirectories: boolean;
}

export interface ITiddlyWikiFilesInfo {
  directories: IDirectorySpecification[];
}

interface IWikiInfo {
  config?: Record<string, string>;
  plugins?: string[];
}

interface ILoadWikiTiddlersOptions {
  filesInfo?: ITiddlyWikiFilesInfo;
  parentPaths?: string[];
  readOnly?: boolean;
  wikiInfo?: IWikiInfo;
}

type WikiInstance = ReturnType<typeof TiddlyWiki>;
type LoadWikiTiddlers = (
  wikiPath: string,
  options?: ILoadWikiTiddlersOptions,
) => ReturnType<WikiInstance['loadWikiTiddlers']>;

const DEFAULT_EXTERNAL_ATTACHMENTS_FOLDER = 'files';

function escapeFilterOperand(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(']', '\\]');
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile TidGi workspace routing into ordinary TiddlyWiki filter runs.
 * Store order remains the workspace priority; any matching run selects the store.
 */
export function buildWorkspaceSaveFilter(workspace: IWikiWorkspace): string {
  const runs: string[] = [];
  for (const tagName of workspace.tagNames) {
    const operand = escapeFilterOperand(tagName);
    runs.push(
      `[title[${operand}]]`,
      `[tag[${operand}]]`,
    );
    if (workspace.includeTagTree) {
      runs.push(
        `[in-tagtree-of:inclusive[${operand}]]`,
      );
    }
  }
  if (workspace.fileSystemPathFilterEnable && workspace.fileSystemPathFilter) {
    runs.push(...workspace.fileSystemPathFilter.split('\n').map(filter => filter.trim()).filter(Boolean));
  }
  return runs.join(' ');
}

function buildIgnoredPathRegExp(externalAttachmentsFolder: string, isFlatMainWiki: boolean): string {
  const ignoredPathParts = [
    '\\.git(?:/|$)',
    'node_modules(?:/|$)',
    '\\.DS_Store$',
    'tidgi\\.config\\.json$',
    `${escapeRegExp(externalAttachmentsFolder)}(?:/|$)`,
  ];
  if (isFlatMainWiki) {
    ignoredPathParts.push(
      'plugins(?:/|$)',
      'themes(?:/|$)',
      'languages(?:/|$)',
      'output(?:/|$)',
      'tiddlywiki\\.(?:info|files)$',
    );
  }
  return `^(?:${ignoredPathParts.join('|')})`;
}

function uniqueSortedWorkspaces(mainWorkspace: IWikiWorkspace, subWikis: IWikiWorkspace[]): IWikiWorkspace[] {
  const byID = new Map<string, IWikiWorkspace>();
  for (const workspace of [mainWorkspace, ...subWikis]) {
    byID.set(workspace.id, workspace);
  }
  const uniqueWorkspaces = [...byID.values()];
  // Dynamic stores use first-match precedence. Specific sub-wiki routes must
  // run before the main workspace's catch-all fallback.
  return [
    ...uniqueWorkspaces.filter(workspace => workspace.id !== mainWorkspace.id).sort(workspaceSorter),
    mainWorkspace,
  ];
}

/**
 * Build an in-memory tiddlywiki.files equivalent. The upstream filesystem
 * adaptor owns loading, watching, indexing, retry and migration; TidGi only
 * translates its workspace model into dynamic-store declarations.
 */
export function createDynamicStoreFilesInfo(options: {
  homePath: string;
  mainWorkspace: IWikiWorkspace;
  readOnly: boolean;
  subWikis: IWikiWorkspace[];
  useWikiFolderAsTiddlersPath: boolean;
}): ITiddlyWikiFilesInfo {
  const {
    homePath,
    mainWorkspace,
    readOnly,
    subWikis,
    useWikiFolderAsTiddlersPath,
  } = options;
  const workspaces = uniqueSortedWorkspaces(mainWorkspace, subWikis);

  return {
    directories: workspaces.map((workspace) => {
      const isMainWiki = workspace.id === mainWorkspace.id;
      const isFlatMainWiki = isMainWiki && useWikiFolderAsTiddlersPath;
      return {
        // "." is resolved by upstream against tiddlywiki.info's configured
        // default-tiddler-location. Flat workspaces explicitly use their root.
        path: isMainWiki
          ? useWikiFolderAsTiddlersPath
            ? path.resolve(homePath)
            : '.'
          : path.resolve(workspace.wikiFolderLocation),
        filesRegExp: '^(?!tiddlywiki\\.(?:info|files)$).*$',
        searchSubdirectories: true,
        isEditableFile: true,
        // Deserialize .tid/.json files and binary files with companion .meta
        // through the native TiddlyWiki file readers.
        isTiddlerFile: true,
        dynamicStore: {
          saveFilter: isMainWiki
            ? [buildWorkspaceSaveFilter(workspace), '[all[tiddlers]]'].filter(Boolean).join(' ')
            : buildWorkspaceSaveFilter(workspace),
          reselectOnSave: true,
          watch: !readOnly && workspace.enableFileSystemWatch,
          watcherProvider: 'tidgi-nsfw',
          ignoredPathRegExp: buildIgnoredPathRegExp(DEFAULT_EXTERNAL_ATTACHMENTS_FOLDER, isFlatMainWiki),
          followSymlinks: !workspace.ignoreSymlinks,
          externalAttachments: {
            basePath: path.resolve(workspace.wikiFolderLocation),
            pathPrefix: DEFAULT_EXTERNAL_ATTACHMENTS_FOLDER,
            moveOnRoute: true,
          },
        },
      };
    }),
  };
}

/**
 * Inject dynamic stores only for the main wiki load. Included wikis continue
 * through the native loader unchanged.
 */
export function createLoadWikiTiddlersWithSubWikis(
  wikiInstance: WikiInstance,
  homePath: string,
  mainWorkspace: IWikiWorkspace,
  subWikis: IWikiWorkspace[],
  options: {
    readOnly?: boolean;
    useWikiFolderAsTiddlersPath?: boolean;
  } = {},
): LoadWikiTiddlers {
  const {
    readOnly = false,
    useWikiFolderAsTiddlersPath = false,
  } = options;
  const originalLoadWikiTiddlers: LoadWikiTiddlers = wikiInstance.loadWikiTiddlers.bind(wikiInstance);
  const filesInfo = createDynamicStoreFilesInfo({
    homePath,
    mainWorkspace,
    readOnly,
    subWikis,
    useWikiFolderAsTiddlersPath,
  });

  return function loadWikiTiddlersWithDynamicStores(wikiPath, loadOptions = {}) {
    if (path.resolve(wikiPath) !== path.resolve(homePath)) {
      return originalLoadWikiTiddlers(wikiPath, loadOptions);
    }
    const wikiInfo: IWikiInfo | undefined = useWikiFolderAsTiddlersPath
      ? {
        plugins: ['tiddlywiki/filesystem'],
        config: {
          'default-tiddler-location': '.',
        },
      }
      : undefined;
    const result = originalLoadWikiTiddlers(wikiPath, {
      ...loadOptions,
      filesInfo,
      wikiInfo,
    });
    return result;
  };
}
