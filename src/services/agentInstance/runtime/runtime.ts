import type { AgentFrameworkContext, AgentInstanceState, AgentLoopGenerator, AgentLoopInput, AgentLoopRuntime, BuiltinToolContext, ChatMessage, Device } from 'memeloop';
import {
  createAgentLoopRunner,
  mergeAgentToolsIntoFrameworkConfig,
  registerBuiltinLoops,
  registerBuiltinPromptPlugins,
  registerBuiltinToolPlugins,
  runAgentToolLoopTurn,
} from 'memeloop';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import type { AgentInstance } from 'memeloop';
import type { IAgentInstanceService } from '../interface';
import { MemeLoopDesktopLLMProvider } from './llmProvider';
import { MemeLoopDesktopStorage } from './storage';
import { MemeLoopDesktopToolRegistry } from './toolRegistry';
import { type AgentUserContent, createMemeLoopUserMessage } from './userMessage';

export class MemeLoopDesktopRuntime {
  private readonly storage: MemeLoopDesktopStorage;
  private readonly toolRegistry = new MemeLoopDesktopToolRegistry();

  public constructor(
    private readonly options: {
      agentInstanceService: IAgentInstanceService;
      agentDefinitionService: IAgentDefinitionService;
      externalAPIService: IExternalAPIService;
      deviceNetworkService: IDeviceNetworkService;
      notifyAgentChanged: (agentId: string, agent: AgentInstance) => void;
      isCancelled: (agentId: string) => boolean;
      loopScriptPolicy?: AgentFrameworkContext['loopScriptPolicy'];
    },
  ) {
    this.storage = new MemeLoopDesktopStorage({
      agentInstanceService: options.agentInstanceService,
      agentDefinitionService: options.agentDefinitionService,
      getLocalNodeId: async () => (await options.deviceNetworkService.getLocalIdentity()).peerId,
      notifyAgentChanged: options.notifyAgentChanged,
    });
    registerBuiltinLoops();
    registerBuiltinToolPlugins();
    registerBuiltinPromptPlugins(this.toolRegistry.getPromptPlugins());
  }

  public async runTurn(input: {
    agentId: string;
    content: AgentUserContent;
    beforeCommitMap?: Record<string, { wikiFolderLocation: string; commitHash: string }>;
  }): Promise<AgentInstanceState> {
    const localNodeId = (await this.options.deviceNetworkService.getLocalIdentity()).peerId;
    const userMessage = await createMemeLoopUserMessage({
      agentId: input.agentId,
      content: input.content,
      originNodeId: localNodeId,
      beforeCommitMap: input.beforeCommitMap,
    });
    const context = await this.createContext(input.agentId, undefined, localNodeId);
    const runner = await this.createProfileRunner(input.agentId, context);

    const result = await runAgentToolLoopTurn(
      context,
      {
        conversationId: input.agentId,
        message: input.content.text,
        userMessage,
      },
      {
        onProgress: async (status: string) => {
          const agent = await this.options.agentInstanceService.getAgent(input.agentId).catch(() => undefined);
          if (!agent) return;
          agent.status = { state: 'working', progress: status, modified: new Date() };
          this.options.notifyAgentChanged(input.agentId, agent);
        },
        agentToolLoop: runner ?? undefined,
      },
    );
    return result.state;
  }

  private async createProfileRunner(agentId: string, context: AgentFrameworkContext): Promise<((input: AgentLoopInput) => AgentLoopGenerator) | null> {
    const agent = await this.options.agentInstanceService.getAgent(agentId);
    if (!agent) return null;

    return createAgentLoopRunner(context, {
      definitionId: agent.agentDefId,
      conversationId: agentId,
    });
  }

  private createRunChildAgent(parentAgentId: string): AgentLoopRuntime['runChildAgent'] {
    return (input: Parameters<AgentLoopRuntime['runChildAgent']>[0]) => this.runChildAgent(parentAgentId, input);
  }

  private async *runChildAgent(parentAgentId: string, input: Parameters<AgentLoopRuntime['runChildAgent']>[0]): AgentLoopGenerator {
    const childAgent = await this.options.agentInstanceService.createAgent(input.profileId, { volatile: true });
    await this.options.agentInstanceService.updateAgent(childAgent.id, {
      name: `Sub-task: ${input.prompt.slice(0, 50)}`,
    });

    const childContext = await this.createContext(childAgent.id, parentAgentId);
    const childRunner = await this.createProfileRunner(childAgent.id, childContext);
    if (!childRunner) {
      yield { type: 'message', data: `Child agent profile not found: ${input.profileId}` };
      return;
    }

    yield* childRunner({
      conversationId: childAgent.id,
      message: input.prompt,
    });
  }

  private async createContext(
    agentId: string,
    parentAgentId?: string,
    knownLocalNodeId?: string,
  ): Promise<AgentFrameworkContext & DesktopRemoteAgentNetworkContext> {
    const isCancelled = (targetAgentId: string): boolean => {
      return this.options.isCancelled(targetAgentId) || (parentAgentId ? this.options.isCancelled(parentAgentId) : false);
    };

    const remoteNetworkContext = await createDesktopRemoteAgentNetworkContext(this.options.deviceNetworkService);
    const localNodeId = knownLocalNodeId ?? (await this.options.deviceNetworkService.getLocalIdentity()).peerId;
    return {
      storage: this.storage,
      llmProvider: new MemeLoopDesktopLLMProvider({
        agentInstanceService: this.options.agentInstanceService,
        agentDefinitionService: this.options.agentDefinitionService,
        externalAPIService: this.options.externalAPIService,
        isCancelled,
      }),
      tools: this.toolRegistry,
      syncAdapters: [],
      network: this.options.deviceNetworkService,
      ...remoteNetworkContext,
      // A portable orchestration client is fixed to one peer. Until Desktop
      // owns a fleet-aware target selector, direct trusted RPC is the explicit
      // fallback and orchestration remains unsupported rather than misrouted.
      logger,
      loopScriptPolicy: this.options.loopScriptPolicy,
      isCancelled: () => isCancelled(agentId),
      runChildAgent: this.createRunChildAgent(agentId),
      normalizeMessage: message => {
        return { ...message, originNodeId: message.originNodeId || localNodeId };
      },
      onTransientMessage: async (message) => {
        const agent = await this.options.agentInstanceService.getAgent(agentId).catch(() => undefined);
        if (!agent) return;

        // Streaming partials are deliberately UI-only. The MemeLoop core
        // persists one immutable message with the same ID after completion.
        const messages = agent.messages.filter(item => item.messageId !== message.messageId);
        this.options.notifyAgentChanged(agentId, {
          ...agent,
          messages: [...messages, message],
        });
      },
      resolveAgentRuntimeView: async (agentId: string, messages: ChatMessage[]) => {
        const agent = await this.options.agentInstanceService.getAgent(agentId);
        const definition = agent ? await this.options.agentDefinitionService.getAgentDef(agent.agentDefId) : undefined;
        const globalAIConfig = await this.options.externalAPIService.getAIConfig();

        const frameworkConfig = mergeAgentToolsIntoFrameworkConfig(
          agent?.agentFrameworkConfig,
          agent?.agentTools ?? definition?.agentTools,
        );
        const defaultAgent = {
          id: agentId,
          agentDefId: agent?.agentDefId ?? definition?.id ?? agentId,
          status: { state: 'working' as const, modified: new Date() },
          created: new Date(),
          messages: [],
          description: '',
          systemPrompt: '',
          tools: [],
          version: '1',
        };
        return {
          ...(agent ?? defaultAgent),
          id: agentId,
          messages,
          agentDefId: agent?.agentDefId ?? definition?.id ?? agentId,
          status: agent?.status ?? { state: 'working' as const, modified: new Date() },
          created: agent?.created ?? new Date(),
          agentFrameworkConfig: frameworkConfig,
          aiApiConfig: {
            ...globalAIConfig,
            ...definition?.aiApiConfig,
            ...agent?.aiApiConfig,
          },
        };
      },
      agentToolLoop: {
        maxIterations: 32,
        isCancelled,
        fallbackRegistryTools: false,
      },
      resolveAgentDefinition: async definitionId => {
        const definition = await this.options.agentDefinitionService.getAgentDef(definitionId);
        if (!definition) return null;

        return {
          ...definition,
          agentFrameworkConfig: mergeAgentToolsIntoFrameworkConfig(
            definition.agentFrameworkConfig,
            definition.agentTools,
          ),
        };
      },
    };
  }
}

export type DesktopRemoteAgentNetworkContext = Pick<BuiltinToolContext, 'getPeers' | 'sendRpcToNode' | 'localNodeId'>;

/** Host bridge used by remoteAgent and MCP proxy tools. */
export async function createDesktopRemoteAgentNetworkContext(
  deviceNetworkService: IDeviceNetworkService,
): Promise<DesktopRemoteAgentNetworkContext> {
  const identity = await deviceNetworkService.getLocalIdentity();
  return {
    localNodeId: identity.peerId,
    getPeers: async (): Promise<Device[]> => {
      const devices = await deviceNetworkService.listDevices();
      return devices.filter(device => device.trusted === true);
    },
    sendRpcToNode: (nodeId, method, parameters) => deviceNetworkService.sendRpc(nodeId, method, parameters),
  };
}
