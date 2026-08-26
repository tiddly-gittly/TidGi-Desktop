import type {
  AgentFrameworkContext,
  AgentInstanceState,
  AgentLoopGenerator,
  AgentLoopInput,
  AgentLoopRuntime,
  AgentModelConfig,
  AgentRunStateStore,
  BuiltinToolContext,
  ChatMessage,
  Device,
  MemeLoopRuntime,
  PromptConcatTool,
  PromptPreviewAuditDetailChunk,
  PromptPreviewAuditDetailRequest,
  PromptPreviewAuditPage,
  PromptPreviewAuditPageRequest,
  PromptPreviewAuditReleaseRequest,
} from 'memeloop';
import { createAgentLoopRunner, createMemeLoopRuntime, mergeAgentToolsIntoFrameworkConfig, ProviderRegistry, registerBuiltinPromptPlugins, runAgentToolLoopTurn } from 'memeloop';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import type { AgentInstance } from 'memeloop';
import type { IAgentInstanceService } from '../interface';
import { type DesktopPromptPreviewPreparedExecution, type DesktopPromptPreviewPrepareInput, DesktopPromptPreviewService } from '../promptPreview';
import { MemeLoopDesktopLLMProvider } from './llmProvider';
import { MemeLoopDesktopStorage } from './storage';
import { MemeLoopDesktopToolRegistry } from './toolRegistry';
import { type AgentUserContent, createMemeLoopUserMessage } from './userMessage';

export class MemeLoopDesktopRuntime {
  private readonly storage: MemeLoopDesktopStorage;
  private readonly toolRegistry = new MemeLoopDesktopToolRegistry();
  private readonly promptPreviewService: DesktopPromptPreviewService;
  private coreRuntimePromise: Promise<MemeLoopRuntime> | undefined;

  public constructor(
    private readonly options: {
      agentInstanceService: IAgentInstanceService;
      agentDefinitionService: IAgentDefinitionService;
      externalAPIService: IExternalAPIService;
      deviceNetworkService: IDeviceNetworkService;
      notifyAgentChanged: (agentId: string, agent: AgentInstance) => void;
      notifyTransientMessage: (message: ChatMessage) => void | Promise<void>;
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
    this.promptPreviewService = new DesktopPromptPreviewService({
      createContext: (conversationId, signal) => this.createContext(conversationId, undefined, undefined, signal),
    });
    registerBuiltinPromptPlugins(this.toolRegistry.getPromptPlugins());
  }

  public async runTurn(input: {
    agentId: string;
    content: AgentUserContent;
    beforeCommitMap?: Record<string, { wikiFolderLocation: string; commitHash: string }>;
    persistedUserMessage?: ChatMessage;
  }): Promise<AgentInstanceState> {
    const localNodeId = (await this.options.deviceNetworkService.getLocalIdentity()).peerId;
    const userMessage = input.persistedUserMessage ?? await createMemeLoopUserMessage({
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
        ...(input.persistedUserMessage ? { persistedUserMessage: input.persistedUserMessage } : {}),
      },
      {
        onProgress: async (status: string) => {
          const agent = await this.options.agentInstanceService.getAgentMetadata(input.agentId).catch(() => undefined);
          if (!agent) return;
          this.options.notifyAgentChanged(input.agentId, {
            ...agent,
            messages: [],
            status: { state: 'working', progress: status, modified: new Date() },
          });
        },
        agentToolLoop: runner ?? undefined,
      },
    );
    return result.state;
  }

  public getPromptPlugins(): Map<string, PromptConcatTool> {
    return this.toolRegistry.getPromptPlugins();
  }

  /** One durable Core runtime shared by local UI and authenticated Device RPC. */
  public getCoreRuntime(runStateStore: AgentRunStateStore): Promise<MemeLoopRuntime> {
    if (this.coreRuntimePromise) return this.coreRuntimePromise;
    const pending = (async () => {
      const context = await this.createContext('__memeloop_runtime__');
      return createMemeLoopRuntime(context, { runStateStore });
    })();
    this.coreRuntimePromise = pending;
    void pending.catch(() => {
      if (this.coreRuntimePromise === pending) this.coreRuntimePromise = undefined;
    });
    return pending;
  }

  public preparePromptPreviewExecutionModelRequest(
    input: DesktopPromptPreviewPrepareInput,
  ): Promise<DesktopPromptPreviewPreparedExecution> {
    return this.promptPreviewService.prepare(input);
  }

  public cancelPromptPreview(requestId: string): void {
    this.promptPreviewService.cancel(requestId);
  }

  public getPromptPreviewAuditPage(request: PromptPreviewAuditPageRequest): PromptPreviewAuditPage {
    return this.promptPreviewService.getAuditPage(request);
  }

  public getPromptPreviewAuditDetail(request: PromptPreviewAuditDetailRequest): PromptPreviewAuditDetailChunk {
    return this.promptPreviewService.getAuditDetail(request);
  }

  public releasePromptPreviewAuditSession(request: PromptPreviewAuditReleaseRequest): void {
    this.promptPreviewService.release(request);
  }

  public getPromptPreviewMessagesForHost(sessionId: string, expectedRevision: string): readonly ChatMessage[] {
    return this.promptPreviewService.getMessagesForHost(sessionId, expectedRevision);
  }

  public async dispose(): Promise<void> {
    const runtime = this.coreRuntimePromise ? await this.coreRuntimePromise.catch(() => undefined) : undefined;
    await runtime?.dispose();
    this.coreRuntimePromise = undefined;
    this.promptPreviewService.dispose();
    this.toolRegistry.dispose();
  }

  private async createProfileRunner(agentId: string, context: AgentFrameworkContext): Promise<((input: AgentLoopInput) => AgentLoopGenerator) | null> {
    const agent = await this.options.agentInstanceService.getAgentMetadata(agentId);
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
    signal?: AbortSignal,
  ): Promise<AgentFrameworkContext & DesktopRemoteAgentNetworkContext> {
    signal?.throwIfAborted();
    const isCancelled = (targetAgentId: string): boolean => {
      return signal?.aborted === true || this.options.isCancelled(targetAgentId) || (parentAgentId ? this.options.isCancelled(parentAgentId) : false);
    };

    const remoteNetworkContext = await createDesktopRemoteAgentNetworkContext(this.options.deviceNetworkService);
    signal?.throwIfAborted();
    const localNodeId = knownLocalNodeId ?? (await this.options.deviceNetworkService.getLocalIdentity()).peerId;
    signal?.throwIfAborted();
    const modelBindings = await this.createModelBindings();
    signal?.throwIfAborted();
    return {
      storage: this.storage,
      llmProvider: modelBindings.fallbackProvider,
      modelProviderRegistry: modelBindings.registry,
      ...(modelBindings.defaultModelConfig === undefined
        ? {}
        : { defaultModelConfig: modelBindings.defaultModelConfig }),
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
        // Streaming partials are deliberately UI-only. The MemeLoop core
        // persists one immutable message with the same ID after completion.
        await this.options.notifyTransientMessage(message);
      },
      resolveAgentRuntimeView: async (agentId: string, messages: ChatMessage[]) => {
        const agent = await this.options.agentInstanceService.getAgentMetadata(agentId);
        const definition = agent ? await this.options.agentDefinitionService.getAgentDef(agent.agentDefId) : undefined;
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
          modelConfig: agent?.modelConfig ?? definition?.modelConfig,
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

  private createModelBindings(): Promise<DesktopModelBindings> {
    return createDesktopModelBindings(this.options.externalAPIService);
  }
}

export interface DesktopModelBindings {
  registry: ProviderRegistry;
  fallbackProvider: MemeLoopDesktopLLMProvider;
  defaultModelConfig?: AgentModelConfig;
}

/** Build one immutable model-route snapshot for an execution context. */
export async function createDesktopModelBindings(
  externalAPIService: IExternalAPIService,
): Promise<DesktopModelBindings> {
  const providers = await externalAPIService.getAIProviders();
  const registry = new ProviderRegistry();
  const adapters = new Map<string, MemeLoopDesktopLLMProvider>();
  for (const provider of providers) {
    if (provider.enabled === false || provider.models.length === 0) continue;
    const adapter = new MemeLoopDesktopLLMProvider({
      providerId: provider.provider,
      externalAPIService,
    });
    registry.register(
      { ownerId: 'tidgi-desktop', kind: 'host' },
      adapter,
      {
        capabilities: [...new Set(provider.models.flatMap(model => model.features ?? []))],
        models: provider.models.map(model => ({
          modelId: model.name,
          wireModelId: model.name,
          apiMode: model.apiMode ?? 'chat-completions',
        })),
      },
    );
    adapters.set(provider.provider, adapter);
  }

  const globalConfig = await externalAPIService.getAIConfig();
  const selected = globalConfig.default;
  const parameters = globalConfig.modelParameters;
  const maxOutputTokens = parameters.maxOutputTokens ?? parameters.maxTokens;
  const defaultModelConfig: AgentModelConfig | undefined = selected?.provider && selected.model
    ? {
      providerId: selected.provider,
      modelId: selected.model,
      parameters: {
        ...(parameters.temperature === undefined ? {} : { temperature: parameters.temperature }),
        ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
        ...(parameters.topP === undefined ? {} : { topP: parameters.topP }),
      },
    }
    : undefined;
  const fallbackProvider = selected ? adapters.get(selected.provider) : undefined;
  return {
    registry,
    fallbackProvider: fallbackProvider ?? new MemeLoopDesktopLLMProvider({
      providerId: 'desktop-unconfigured',
      externalAPIService,
    }),
    ...(defaultModelConfig === undefined ? {} : { defaultModelConfig }),
  };
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
