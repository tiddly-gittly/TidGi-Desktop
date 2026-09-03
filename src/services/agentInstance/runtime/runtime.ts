import type {
  AgentDefinition,
  AgentFrameworkConfig,
  AgentFrameworkContext,
  AgentLoopGenerator,
  AgentLoopInput,
  AgentLoopRuntime,
  AgentModelConfig,
  AgentRunStateStore,
  BuiltinToolContext,
  ChatMessage,
  Device,
  MemeLoopRuntime,
  PromptConcatStreamState,
  PromptPreviewAuditDetailChunk,
  PromptPreviewAuditDetailRequest,
  PromptPreviewAuditPage,
  PromptPreviewAuditPageRequest,
  PromptPreviewAuditReleaseRequest,
  PromptPreviewPreparedExecution,
  PromptPreviewPrepareRequest,
  ToolApprovalResolution,
} from 'memeloop';
import {
  createAgentLoopRunner,
  createMemeLoopRuntime,
  materializeAgentInstanceModel,
  mergeAgentToolsIntoFrameworkConfig,
  promptConcatStream,
  ProviderRegistry,
  registerBuiltinPromptPlugins,
  ToolApprovalBroker,
} from 'memeloop';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { hasUsableProviderCredentialReference } from '@services/externalAPI/providerCredentials';
import { logger } from '@services/libs/log';
import type { DataSource } from 'typeorm';
import type { IAgentInstanceService } from '../interface';
import { DesktopPromptPreviewService } from '../promptPreview';
import { MemeLoopDesktopLLMProvider } from './llmProvider';
import { DesktopLoopCheckpointStore } from './loopCheckpointStore';
import { MemeLoopDesktopStorage } from './storage';
import { MemeLoopDesktopToolRegistry } from './toolRegistry';

/**
 * Resolve one fresh execution definition for a Desktop conversation.
 *
 * Core invokes this port at every user-turn boundary and between self-directed
 * rounds. Definition data remains the base, while the conversation's persisted
 * instance prompt/model overrides are deliberately read on every invocation so
 * an editor save affects the next prompt build without rebuilding the runtime
 * or teaching loop scripts about host JSON.
 */
export async function resolveDesktopAgentDefinition(options: {
  agentId: string;
  definitionId: string;
  agentInstanceService: IAgentInstanceService;
  agentDefinitionService: IAgentDefinitionService;
}): Promise<AgentDefinition | null> {
  const definition = await options.agentDefinitionService.getAgentDef(options.definitionId);
  if (!definition) return null;
  const instance = await options.agentInstanceService.getAgentMetadata(options.agentId);
  const isMatchingInstance = instance?.agentDefId === options.definitionId;
  const frameworkConfig = isMatchingInstance
    ? instance.agentFrameworkConfig ?? definition.agentFrameworkConfig
    : definition.agentFrameworkConfig;
  const modelConfig = isMatchingInstance
    ? instance.modelConfig ?? definition.modelConfig
    : definition.modelConfig;

  return {
    ...definition,
    agentFrameworkConfig: mergeAgentToolsIntoFrameworkConfig(frameworkConfig, definition.agentTools),
    ...(modelConfig === undefined ? {} : { modelConfig }),
  };
}

/** Bind Desktop services while keeping Core's per-turn conversation identity authoritative. */
export function createDesktopAgentDefinitionResolver(options: {
  fallbackAgentId: string;
  agentInstanceService: IAgentInstanceService;
  agentDefinitionService: IAgentDefinitionService;
}): NonNullable<AgentFrameworkContext['resolveAgentDefinition']> {
  return (definitionId, resolutionOptions) =>
    resolveDesktopAgentDefinition({
      agentId: resolutionOptions?.conversationId ?? options.fallbackAgentId,
      definitionId,
      agentInstanceService: options.agentInstanceService,
      agentDefinitionService: options.agentDefinitionService,
    });
}

export class MemeLoopDesktopRuntime {
  private readonly storage: MemeLoopDesktopStorage;
  private readonly toolRegistry = new MemeLoopDesktopToolRegistry();
  private readonly promptPreviewService: DesktopPromptPreviewService;
  private readonly toolApprovals = new ToolApprovalBroker({ runtimeId: crypto.randomUUID() });
  private coreRuntimePromise: Promise<MemeLoopRuntime> | undefined;

  public constructor(
    private readonly options: {
      agentInstanceService: IAgentInstanceService;
      agentDefinitionService: IAgentDefinitionService;
      externalAPIService: IExternalAPIService;
      deviceNetworkService: IDeviceNetworkService;
      notifyTransientMessage: (message: ChatMessage) => void | Promise<void>;
      loopScriptPolicy?: AgentFrameworkContext['loopScriptPolicy'];
      dataSource: DataSource;
    },
  ) {
    this.storage = new MemeLoopDesktopStorage({
      agentInstanceService: options.agentInstanceService,
      agentDefinitionService: options.agentDefinitionService,
      getLocalNodeId: async () => (await options.deviceNetworkService.getLocalIdentity()).peerId,
    });
    this.promptPreviewService = new DesktopPromptPreviewService({
      createContext: (conversationId, signal) => this.createContext(conversationId, undefined, signal),
    });
    registerBuiltinPromptPlugins(this.toolRegistry.getPromptPlugins());
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
    input: PromptPreviewPrepareRequest,
  ): Promise<PromptPreviewPreparedExecution> {
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

  public resolveToolApproval(resolution: ToolApprovalResolution): boolean {
    return this.toolApprovals.resolveApproval(resolution);
  }

  public async *concatPromptPreview(input: {
    sessionId: string;
    expectedRevision: string;
    agentFrameworkConfig: AgentFrameworkConfig;
    signal: AbortSignal;
  }): AsyncGenerator<PromptConcatStreamState, PromptConcatStreamState, unknown> {
    const retained = this.promptPreviewService.getContextForHost(input.sessionId, input.expectedRevision);
    const context = await this.createContext(retained.conversationId, undefined, input.signal);
    input.signal.throwIfAborted();
    return yield* promptConcatStream(
      { agentFrameworkConfig: input.agentFrameworkConfig },
      [...retained.messages],
      { ...context, operationSignal: input.signal },
    );
  }

  public async dispose(): Promise<void> {
    const runtime = this.coreRuntimePromise ? await this.coreRuntimePromise.catch(() => undefined) : undefined;
    await runtime?.dispose();
    this.coreRuntimePromise = undefined;
    this.promptPreviewService.dispose();
    this.toolRegistry.dispose();
    this.toolApprovals.dispose();
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
    input.signal?.throwIfAborted();
    const existingChild = await this.options.agentInstanceService.getAgentMetadata(input.conversationId);
    if (existingChild && existingChild.agentDefId !== input.profileId) {
      throw new Error(`child conversation '${input.conversationId}' is bound to another profile`);
    }
    const childAgent = existingChild ?? await this.options.agentInstanceService.createAgent(input.profileId, {
      id: input.conversationId,
      volatile: true,
    });
    input.signal?.throwIfAborted();
    await this.options.agentInstanceService.updateAgent(childAgent.id, {
      name: `Sub-task: ${input.prompt.slice(0, 50)}`,
    });

    const childContext = await this.createContext(childAgent.id, parentAgentId, input.signal);
    const childRunner = await this.createProfileRunner(childAgent.id, childContext);
    if (!childRunner) {
      yield { type: 'message', data: `Child agent profile not found: ${input.profileId}` };
      return;
    }

    yield* childRunner({
      conversationId: childAgent.id,
      message: input.prompt,
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
    });
  }

  private async createContext(
    agentId: string,
    _parentAgentId?: string,
    signal?: AbortSignal,
  ): Promise<AgentFrameworkContext & DesktopRemoteAgentNetworkContext> {
    signal?.throwIfAborted();
    const remoteNetworkContext = await createDesktopRemoteAgentNetworkContext(this.options.deviceNetworkService);
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
      toolApprovals: this.toolApprovals,
      syncAdapters: [],
      network: this.options.deviceNetworkService,
      ...remoteNetworkContext,
      // A portable orchestration client is fixed to one peer. Until Desktop
      // owns a fleet-aware target selector, direct trusted RPC is the explicit
      // fallback and orchestration remains unsupported rather than misrouted.
      logger,
      loopCheckpoints: new DesktopLoopCheckpointStore(
        this.options.dataSource,
        async () => (await this.options.deviceNetworkService.getLocalIdentity()).peerId,
      ),
      loopScriptPolicy: this.options.loopScriptPolicy,
      runChildAgent: this.createRunChildAgent(agentId),
      onTransientMessage: async (message) => {
        // Streaming partials are deliberately UI-only. The MemeLoop core
        // persists one immutable message with the same ID after completion.
        await this.options.notifyTransientMessage(message);
      },
      resolveAgentRuntimeView: async (agentId: string, messages: ChatMessage[]) => {
        const metadata = await this.options.agentInstanceService.getAgentMetadata(agentId);
        if (!metadata) throw new Error(`agent instance not found: ${agentId}`);
        const definition = await resolveDesktopAgentDefinition({
          agentId,
          definitionId: metadata.agentDefId,
          agentInstanceService: this.options.agentInstanceService,
          agentDefinitionService: this.options.agentDefinitionService,
        });
        if (!definition) throw new Error(`agent definition not found: ${metadata.agentDefId}`);
        return materializeAgentInstanceModel(metadata, definition, messages);
      },
      agentToolLoop: {
        maxIterations: 32,
        fallbackRegistryTools: false,
      },
      resolveAgentDefinition: createDesktopAgentDefinitionResolver({
        fallbackAgentId: agentId,
        agentInstanceService: this.options.agentInstanceService,
        agentDefinitionService: this.options.agentDefinitionService,
      }),
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
  const accounts = await externalAPIService.getProviderAccounts();
  const registry = new ProviderRegistry();
  const adapters = new Map<string, MemeLoopDesktopLLMProvider>();
  for (const account of accounts) {
    if (
      account.enabled === false || account.models.length === 0 ||
      !hasUsableProviderCredentialReference(account)
    ) continue;
    const adapter = new MemeLoopDesktopLLMProvider({
      providerId: account.providerId,
      externalAPIService,
    });
    registry.register(
      { ownerId: 'tidgi-desktop', kind: 'host' },
      adapter,
      {
        models: account.models,
      },
    );
    adapters.set(account.providerId, adapter);
  }

  const globalConfig = await externalAPIService.getAIConfig();
  const defaultModelConfig: AgentModelConfig | undefined = globalConfig.default &&
      adapters.has(globalConfig.default.providerId) &&
      accounts.find(account => account.providerId === globalConfig.default?.providerId)
        ?.models.some(route => route.modelId === globalConfig.default?.modelId)
    ? globalConfig.default
    : undefined;
  const fallbackProvider = defaultModelConfig ? adapters.get(defaultModelConfig.providerId) : undefined;
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
