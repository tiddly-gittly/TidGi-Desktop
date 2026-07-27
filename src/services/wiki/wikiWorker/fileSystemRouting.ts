import { buildTiddlerRoutingInfo, isWikiWorkspaceWithRouting } from '@services/wiki/plugin/watchFileSystemAdaptor/routingUtilities';
import type { ITiddlerRoutingInfo } from '@services/wiki/plugin/watchFileSystemAdaptor/tiddlerRoutingInfo';
import type { IWikiWorkspace } from '@services/workspaces/interface';
import { workspaceSorter } from '@services/workspaces/utilities';
import type { TiddlyWiki } from 'tiddlywiki';

type WikiInstance = ReturnType<typeof TiddlyWiki>;

let routingInfoGetter: ((title: string) => ITiddlerRoutingInfo) | undefined;

export function configureFileSystemRouting(options: {
  mainWorkspace: IWikiWorkspace;
  subWikis: IWikiWorkspace[];
  wikiInstance: WikiInstance;
}): void {
  const { mainWorkspace, subWikis, wikiInstance } = options;
  const routingWorkspaces = [...new Map(
    [mainWorkspace, ...subWikis]
      .filter(workspaceItem => isWikiWorkspaceWithRouting(workspaceItem, mainWorkspace.id))
      .map(workspaceItem => [workspaceItem.id, workspaceItem]),
  ).values()].sort(workspaceSorter);

  routingInfoGetter = (title: string) => {
    const tiddler = wikiInstance.wiki.getTiddler(title);
    return buildTiddlerRoutingInfo(
      title,
      tiddler?.fields.tags ?? [],
      routingWorkspaces,
      mainWorkspace.id,
      wikiInstance.wiki,
      wikiInstance.rootWidget,
    );
  };
}

export function getFileSystemRoutingInfo(title: string): ITiddlerRoutingInfo {
  return routingInfoGetter?.(title) ?? { featureAvailable: false };
}
