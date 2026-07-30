import { WikiChannel } from '@/constants/channels';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { MemeLoopDesktopStorage } from '@services/agentInstance/runtime/storage';
import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';
import { logger } from '@services/libs/log';
import type { IWikiService } from '@services/wiki/interface';
import { isWikiWorkspace, type IWorkspaceService } from '@services/workspaces/interface';
import { createAgentRuntimeDeviceRpcHandler, type DeviceCapabilities } from 'memeloop';

const emptyCapabilities: DeviceCapabilities = {
  tools: [],
  mcpServers: [],
  hasWiki: false,
  agentLoop: false,
  imChannels: [],
  wikis: [],
};

export interface InitializeAgentServicesOptions {
  agentDefinitionService: IAgentDefinitionService;
  agentInstanceService: IAgentInstanceService;
  deviceNetworkService: IDeviceNetworkService;
  wikiService: IWikiService;
  workspaceService: IWorkspaceService;
}

export async function initializeAgentServices(options: InitializeAgentServicesOptions): Promise<void> {
  const { agentDefinitionService, agentInstanceService, deviceNetworkService, wikiService, workspaceService } = options;

  await agentDefinitionService.initialize();
  await agentInstanceService.initialize();

  const identity = await deviceNetworkService.getLocalIdentity();
  const storage = new MemeLoopDesktopStorage({
    agentInstanceService,
    agentDefinitionService,
    notifyAgentChanged: () => {},
  });

  deviceNetworkService.configureRuntime({
    buildCapabilities: async () => buildDeviceNetworkCapabilities(workspaceService),
    syncStorage: storage,
    rpcHandler: createAgentRuntimeDeviceRpcHandler({
      runtime: {
        createAgent: async ({ definitionId, initialMessage }) => {
          const agent = await agentInstanceService.createAgent(definitionId);
          if (initialMessage) await agentInstanceService.sendMsgToAgent(agent.id, { text: initialMessage });
          return { conversationId: agent.id };
        },
        sendMessage: async ({ conversationId, message }) => {
          await agentInstanceService.sendMsgToAgent(conversationId, { text: message });
        },
        cancelAgent: async (conversationId) => {
          await agentInstanceService.cancelAgent(conversationId);
        },
      },
      storage,
      getAgentDefinitions: () => agentDefinitionService.getAgentDefs(),
      localNodeId: identity.peerId,
    }),
  });

  await initializeTemplateBackends(agentDefinitionService, wikiService, workspaceService);
}

/**
 * Agent conversations are a disposable cache boundary. A stale or damaged
 * agent database must not prevent Wiki, Preferences, or the database cleanup
 * control from starting. The user can delete the cache in Preferences and
 * restart the app to re-enable Agent services.
 */
export async function initializeAgentServicesSafely(options: InitializeAgentServicesOptions): Promise<boolean> {
  try {
    await initializeAgentServices(options);
    return true;
  } catch (error) {
    logger.error('Agent services unavailable; continuing without Agent runtime so the cache can be cleared in Preferences', {
      error,
    });
    return false;
  }
}

async function buildDeviceNetworkCapabilities(workspaceService: IWorkspaceService): Promise<DeviceCapabilities> {
  const wikiPaths: Array<{ wikiId: string; title?: string; pathHint?: string }> = [];
  const workspaces = await workspaceService.getWorkspacesAsList();
  for (const workspace of workspaces) {
    if (isWikiWorkspace(workspace)) {
      wikiPaths.push({
        wikiId: workspace.id ?? workspace.name ?? 'default',
        title: workspace.name,
        pathHint: workspace.wikiFolderLocation,
      });
    }
  }
  return {
    ...emptyCapabilities,
    agentLoop: true,
    hasWiki: wikiPaths.length > 0,
    wikis: wikiPaths,
  };
}

async function initializeTemplateBackends(
  agentDefinitionService: IAgentDefinitionService,
  wikiService: IWikiService,
  workspaceService: IWorkspaceService,
): Promise<void> {
  agentDefinitionService.configureTemplateSource?.(async () => {
    const templates = [];
    const workspaces = await workspaceService.getWorkspacesAsList();
    const activeMain = workspaces.filter((workspace) => isWikiWorkspace(workspace) && workspace.active && !workspace.isSubWiki);

    for (const workspace of activeMain) {
      try {
        const tiddlers = await wikiService.wikiOperationInServer(
          WikiChannel.getTiddlersAsJson,
          workspace.id,
          ['[tag[$:/tags/AI/Template]]'],
        ) as unknown[];
        if (Array.isArray(tiddlers)) {
          templates.push(...tiddlers.map(tiddler => ({ tiddler, workspaceName: workspace.name })));
        }
      } catch {
        // Skip workspaces that fail to respond.
      }
    }
    return templates;
  });
}
