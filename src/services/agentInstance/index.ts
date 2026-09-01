import { inject, injectable } from 'inversify';
import path from 'node:path';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { DataSource, Repository } from 'typeorm';

import { USER_DATA_FOLDER } from '@/constants/appPaths';
import { MEME_LOOP_DATABASE_KEY } from '@/constants/database';
import { isTest } from '@/constants/environment';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';

import type { IDatabaseService } from '@services/database/interface';
import { AgentInstanceEntity, AgentInstanceMessageEntity, ScheduledTaskEntity } from '@services/database/schema/agent';
import { ConversationTimelineStateEntity } from '@services/database/schema/conversationEvent';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import type { IGitService } from '@services/git/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import {
  AGENT_RUN_ERROR_MESSAGE_KEYS,
  AGENT_TOOL_LOOP_ID,
  type AgentCommittedAttachment,
  type AgentConversationMessagePage,
  type AgentConversationMessagePageOptions,
  type AgentConversationMessageProjection,
  type AgentConversationMessageWindowRequest,
  type AgentConversationMessageWindowResult,
  agentConversationPageOptionsToStorage,
  type AgentConversationUpdate,
  agentConversationWindowRequestToStorage,
  type AgentDeviceRpcDeleteTurnRequest,
  type AgentDeviceRpcDeleteTurnResponse,
  type AgentDeviceRpcGetTurnDetailRequest,
  type AgentDeviceRpcGetTurnDetailResponse,
  agentDeviceRpcPendingUserMessageFromChatMessage,
  type AgentDeviceRpcRetryTurnRequest,
  type AgentDeviceRpcRetryTurnResponse,
  type AgentDeviceRpcRunTurnRequest,
  type AgentFrameworkConfig,
  type AgentHeartbeatConfig,
  type AgentInstanceLatestStatus,
  type AgentInstanceMetadata,
  type AgentInstanceMetadataUpdate,
  type AgentManagementCallOptions,
  type AgentRunError,
  AgentRunFailure,
  type AgentRuntimeView,
  assertPromptPreviewGeneratedResult,
  type AttachmentReference,
  type ChatMessage,
  type CompactionCandidatePage,
  type ConversationEvent,
  type ConversationEventDraft,
  type ConversationEventPage,
  conversationEventToMessage,
  type ConversationFullContentMessagePage,
  type ConversationListPage,
  type ConversationMessageDetailRange,
  type ConversationMessageIdentity,
  type ConversationMessagePage,
  type ConversationMessageWindowResult,
  type ConversationTimelinePage,
  createAgentRunError,
  type CreateScheduledTaskInput,
  type GetCompactionCandidatePageOptions,
  type GetConversationEventPageOptions,
  type GetConversationListPageOptions,
  type GetConversationMessageWindowAroundOptions,
  type GetConversationTimelinePageOptions,
  type GetFullContentMessagePageOptions,
  type GetMessagePageOptions,
  type GetRetainedCompactionControlsOptions,
  type ListScheduledTasksOptions,
  type MemeLoopRunHandle,
  type MemeLoopRunStatus,
  type MemeLoopRuntime,
  messageToConversationEvent,
  type MessageVersionFrontier,
  type MessageVersionFrontierCursor,
  type MessageVersionFrontierPage,
  projectConversationMessageForList,
  projectTransientConversationMessageForList,
  type PromptConcatStreamState,
  type PromptPreviewAuditDetailChunk,
  type PromptPreviewAuditDetailRequest,
  type PromptPreviewAuditPage,
  type PromptPreviewAuditPageRequest,
  type PromptPreviewAuditReleaseRequest,
  type PromptPreviewPreparedExecution,
  type PromptPreviewPrepareRequest,
  type RemoteAgentExecuteRequest,
  type RetainedCompactionControlPage,
  type ScheduledTask,
  type ScheduledTaskPage,
  type ScheduledTaskRpcScopedTaskRequest,
  type ScheduledTaskRpcUpdatePatch,
  storagePageToAgentConversationPage,
  storageWindowToAgentConversationWindow,
  type ToolApprovalResolution,
} from 'memeloop';
import type { ReadDesktopAgentAttachmentChunkInput } from './attachmentUploadProtocol';
import {
  type BeginDesktopAttachmentUploadInput,
  type DesktopAttachmentUploadScope,
  DesktopAttachmentUploadStore,
  type WriteDesktopAttachmentChunkInput,
} from './attachmentUploadStore';
import { DesktopAgentRunStateStore } from './runtime/agentRunStateStore';

import * as repo from './agentRepository';
import type { IAgentInstanceService } from './interface';
import { MemeLoopDesktopRuntime } from './runtime/runtime';
import { createAgentDeviceRpcPendingUserMessage } from './runtime/userMessage';
import { cleanupMCPClient } from './tools/modelContextProtocol';
import { startHeartbeat, stopHeartbeat } from './tools/scheduledTaskManager';
import {
  addTask as stmAddTask,
  cancelTasksForAgent,
  getActiveTasks as stmGetActiveTasks,
  getCronPreviewDates as stmGetCronPreviewDates,
  getScheduledTaskPageForAgent as stmGetScheduledTaskPageForAgent,
  getTaskByScope as stmGetTaskByScope,
  initScheduledTaskManager,
  removeTask as stmRemoveTask,
  removeTaskScoped as stmRemoveTaskScoped,
  restoreScheduledTasks,
  updateTask as stmUpdateTask,
  updateTaskScoped as stmUpdateTaskScoped,
} from './tools/scheduledTaskManager';

/**
 * Enforce Core's metadata-only renderer contract at runtime.
 *
 * TypeScript structural types are erased, so an AgentInstanceModel can reach
 * this private boundary with an extra, unbounded `messages` property even
 * though the declared input is AgentRuntimeView. Explicit selection keeps the
 * subscription payload exact without mutating the caller's object.
 */
function projectAgentRuntimeView(agent: AgentRuntimeView): AgentRuntimeView {
  return {
    id: agent.id,
    agentDefId: agent.agentDefId,
    ...(agent.name === undefined ? {} : { name: agent.name }),
    status: agent.status,
    created: agent.created,
    ...(agent.modified === undefined ? {} : { modified: agent.modified }),
    ...(agent.modelConfig === undefined ? {} : { modelConfig: agent.modelConfig }),
    ...(agent.avatarUrl === undefined ? {} : { avatarUrl: agent.avatarUrl }),
    ...(agent.agentFrameworkConfig === undefined ? {} : { agentFrameworkConfig: agent.agentFrameworkConfig }),
    closed: agent.closed,
    volatile: agent.volatile,
    preview: agent.preview,
    ...(agent.definition === undefined ? {} : { definition: agent.definition }),
  };
}

@injectable()
export class AgentInstanceService implements IAgentInstanceService {
  @inject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @inject(serviceIdentifier.AgentDefinition)
  private readonly agentDefinitionService!: IAgentDefinitionService;

  @inject(serviceIdentifier.ExternalAPI)
  private readonly externalAPIService!: IExternalAPIService;

  @inject(serviceIdentifier.DeviceNetwork)
  private readonly deviceNetworkService!: IDeviceNetworkService;

  @inject(serviceIdentifier.Git)
  private readonly gitService!: IGitService;

  @inject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  private dataSource: DataSource | null = null;
  private agentInstanceRepository: Repository<AgentInstanceEntity> | null = null;
  private agentMessageRepository: Repository<AgentInstanceMessageEntity> | null = null;
  private scheduledTaskRepositoryReady = false;
  private attachmentUploadStore: DesktopAttachmentUploadStore | null = null;

  private agentInstanceSubjects: Map<string, BehaviorSubject<AgentRuntimeView | undefined>> = new Map();
  private statusSubjects: Map<string, BehaviorSubject<AgentInstanceLatestStatus | undefined>> = new Map();
  private conversationSubjects = new Map<string, Subject<AgentConversationUpdate>>();
  private conversationInvalidationWatermarks = new Map<string, { revision: string; totalMessages: number }>();
  private conversationInvalidationQueues = new Map<string, Promise<void>>();

  private frameworkSchemas: Map<string, Record<string, unknown>> = new Map();
  private memeLoopRuntime: MemeLoopDesktopRuntime | null = null;
  private activeDurableRunIds = new Map<string, Set<string>>();
  private durableErrorPersistence = new Map<string, Promise<void>>();

  public async initialize(): Promise<void> {
    try {
      await this.initializeDatabase();
      await this.initializeFrameworks();
      // Restore definition-owned heartbeat timers after DB + frameworks are ready.
      await this.restoreBackgroundTasks();
      // Restore unified ScheduledTaskManager tasks
      await this.restoreScheduledTaskManagerTasks();
    } catch (error) {
      logger.error('Failed to initialize agent instance service', { error });
      throw error;
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // Database is already initialized in the agent definition service
      this.dataSource = await this.databaseService.getDatabase(MEME_LOOP_DATABASE_KEY);
      this.agentInstanceRepository = this.dataSource.getRepository(AgentInstanceEntity);
      this.agentMessageRepository = this.dataSource.getRepository(AgentInstanceMessageEntity);
      this.attachmentUploadStore = new DesktopAttachmentUploadStore(path.join(USER_DATA_FOLDER, 'meme-loop-attachments'));
      await this.attachmentUploadStore.initialize();

      // Initialize the unified ScheduledTaskManager
      const stmRepo = this.dataSource.getRepository(ScheduledTaskEntity);
      initScheduledTaskManager(stmRepo, this, async () => {
        const identity = await this.deviceNetworkService.getLocalIdentity();
        return { peerId: identity.peerId, deviceName: identity.deviceName };
      });
      this.scheduledTaskRepositoryReady = true;

      logger.debug('AgentInstance repositories initialized');
    } catch (error) {
      logger.error('Failed to initialize agent instance database', { error });
      throw error;
    }
  }

  public async initializeFrameworks(): Promise<void> {
    try {
      // Construct the one runtime-owned registry. Tool modules are pure
      // definitions, so importing them never mutates another runtime.
      this.getMemeLoopRuntime();
      logger.debug('AgentInstance runtime-owned ToolDefinitionRegistry initialized');

      // Register built-in frameworks
      this.registerBuiltinFrameworks();
      logger.debug('AgentInstance frameworks registered');
    } catch (error) {
      logger.error('Failed to initialize agent instance frameworks', { error });
      throw error;
    }
  }

  public registerBuiltinFrameworks(): void {
    const promptChildNodeSchema = {
      type: 'object',
      title: 'Prompt',
      additionalProperties: true,
      properties: {
        id: { type: 'string', title: 'ID' },
        caption: { type: 'string', title: 'Caption' },
        role: { type: 'string', title: 'Role', enum: ['system', 'user', 'assistant', 'tool'] },
        enabled: { type: 'boolean', title: 'Enabled', default: true },
        dynamicPosition: { type: 'string', title: 'Dynamic Position', enum: ['deferToEnd'] },
        tags: { type: 'array', title: 'Tags', items: { type: 'string' } },
        text: { type: 'string', title: 'Text' },
      },
    };

    const promptNodeSchema = {
      type: 'object',
      title: 'Prompt',
      additionalProperties: true,
      properties: {
        id: { type: 'string', title: 'ID' },
        caption: { type: 'string', title: 'Caption' },
        role: { type: 'string', title: 'Role', enum: ['system', 'user', 'assistant', 'tool'] },
        enabled: { type: 'boolean', title: 'Enabled', default: true },
        dynamicPosition: { type: 'string', title: 'Dynamic Position', enum: ['deferToEnd'] },
        tags: { type: 'array', title: 'Tags', items: { type: 'string' } },
        text: { type: 'string', title: 'Text' },
        children: {
          type: 'array',
          title: 'Children',
          items: promptChildNodeSchema,
        },
      },
    };

    this.frameworkSchemas.set(AGENT_TOOL_LOOP_ID, {
      type: 'object',
      properties: {
        prompts: { type: 'array', title: 'Prompts', items: promptNodeSchema },
        response: { type: 'array', title: 'Response', items: { type: 'object', additionalProperties: true } },
        plugins: {
          type: 'array',
          title: 'Plugins',
          items: {
            type: 'object',
            title: 'Plugin',
            additionalProperties: true,
            properties: {
              id: { type: 'string', title: 'ID' },
              toolId: { type: 'string', title: 'Tool ID' },
              enabled: { type: 'boolean', title: 'Enabled', default: true },
            },
          },
        },
      },
      uiSchema: {
        'ui:order': ['prompts', 'plugins', 'response'],
        prompts: {
          items: {
            text: { 'ui:widget': 'textarea' },
            tags: { 'ui:widget': 'TagsWidget' },
            children: {
              items: {
                text: { 'ui:widget': 'textarea' },
                tags: { 'ui:widget': 'TagsWidget' },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Restore heartbeat timers for active agents after app restart.
   * Heartbeats: read from AgentDefinition.heartbeat for all non-closed instances.
   * One-shot and cron schedules are restored separately by the unified
   * ScheduledTaskManager; this method only restores definition heartbeats.
   */
  private async restoreBackgroundTasks(): Promise<void> {
    if (!this.agentInstanceRepository) return;
    try {
      // Find all non-closed, non-volatile agent instances with their definitions
      const activeInstances = await this.agentInstanceRepository.find({
        where: { closed: false, volatile: false },
        relations: { agentDefinition: true },
      });

      let heartbeatsRestored = 0;

      for (const instance of activeInstances) {
        // Restore heartbeat from definition
        const heartbeatConfig = instance.agentDefinition?.heartbeat;
        if (heartbeatConfig?.enabled) {
          startHeartbeat(instance.id, instance.agentDefId, heartbeatConfig, this, { createdBy: 'agent-definition' });
          heartbeatsRestored++;
        }
      }

      if (heartbeatsRestored > 0) {
        logger.info('Background heartbeats restored', { heartbeatsRestored, totalInstances: activeInstances.length });
      }
    } catch (error) {
      logger.error('Failed to restore background tasks', { error });
    }
  }

  /**
   * Restore unified ScheduledTaskManager tasks from DB after app restart.
   */
  private async restoreScheduledTaskManagerTasks(): Promise<void> {
    if (!this.scheduledTaskRepositoryReady || !this.agentInstanceRepository) return;
    try {
      const stmRepo = this.dataSource!.getRepository(ScheduledTaskEntity);

      const isVolatile = async (agentInstanceId: string): Promise<boolean> => {
        const entity = await this.agentInstanceRepository!.findOne({ where: { id: agentInstanceId } });
        return entity?.volatile ?? true;
      };

      await restoreScheduledTasks(stmRepo, isVolatile);
    } catch (error) {
      logger.error('Failed to restore ScheduledTaskManager tasks', { error });
    }
  }

  /**
   * Ensure repositories are initialized
   */
  private ensureRepositories(): void {
    if (!this.agentInstanceRepository || !this.agentMessageRepository) {
      throw new Error('Agent instance repositories not initialized');
    }
  }

  private getAttachmentUploadStore(): DesktopAttachmentUploadStore {
    if (!this.attachmentUploadStore) throw new Error('Agent attachment store not initialized');
    return this.attachmentUploadStore;
  }

  public beginAgentAttachmentUpload(input: BeginDesktopAttachmentUploadInput): Promise<{ uploadId: string }> {
    return this.getAttachmentUploadStore().begin(input);
  }

  public writeAgentAttachmentChunk(input: WriteDesktopAttachmentChunkInput): Promise<{ nextOffset: number }> {
    return this.getAttachmentUploadStore().write(input);
  }

  public async commitAgentAttachmentUpload(input: DesktopAttachmentUploadScope): Promise<AgentCommittedAttachment> {
    return { kind: 'committed', reference: await this.getAttachmentUploadStore().commit(input) };
  }

  public abortAgentAttachmentUpload(input: DesktopAttachmentUploadScope): Promise<void> {
    return this.getAttachmentUploadStore().abort(input);
  }

  public async readAgentAttachmentChunk(input: ReadDesktopAgentAttachmentChunkInput): Promise<Uint8Array | null> {
    await this.assertAgentAttachmentAuthorized(input.conversationId, input.reference, false);
    return this.getAttachmentUploadStore().readRange(input.reference.contentHash, input.offset, input.maxBytes);
  }

  public preparePromptPreviewExecutionModelRequest(
    input: PromptPreviewPrepareRequest,
  ): Promise<PromptPreviewPreparedExecution> {
    return this.getMemeLoopRuntime().preparePromptPreviewExecutionModelRequest(input);
  }

  public async cancelPromptPreview(requestId: string): Promise<void> {
    this.getMemeLoopRuntime().cancelPromptPreview(requestId);
  }

  public async getPromptPreviewAuditPage(request: PromptPreviewAuditPageRequest): Promise<PromptPreviewAuditPage> {
    return this.getMemeLoopRuntime().getPromptPreviewAuditPage(request);
  }

  public async getPromptPreviewAuditDetail(request: PromptPreviewAuditDetailRequest): Promise<PromptPreviewAuditDetailChunk> {
    return this.getMemeLoopRuntime().getPromptPreviewAuditDetail(request);
  }

  public async releasePromptPreviewAuditSession(request: PromptPreviewAuditReleaseRequest): Promise<void> {
    this.getMemeLoopRuntime().releasePromptPreviewAuditSession(request);
  }

  public getAgentAttachmentReference(contentHash: string, options?: { signal?: AbortSignal }): Promise<AttachmentReference | null> {
    return this.getAttachmentUploadStore().getReference(contentHash, options);
  }

  public saveAgentAttachment(reference: AttachmentReference, data: Uint8Array, options?: { signal?: AbortSignal }): Promise<void> {
    return this.getAttachmentUploadStore().save(reference, data, options);
  }

  public readAgentAttachmentRange(
    contentHash: string,
    offset: number,
    maxBytes: number,
    options?: { signal?: AbortSignal },
  ): Promise<Uint8Array | null> {
    return this.getAttachmentUploadStore().readRange(contentHash, offset, maxBytes, options);
  }

  private getMemeLoopRuntime(): MemeLoopDesktopRuntime {
    if (!this.memeLoopRuntime) {
      this.memeLoopRuntime = new MemeLoopDesktopRuntime({
        agentInstanceService: this,
        agentDefinitionService: this.agentDefinitionService,
        externalAPIService: this.externalAPIService,
        deviceNetworkService: this.deviceNetworkService,
        notifyTransientMessage: (message) => this.publishConversationMessage(message, true),
        dataSource: this.dataSource!,
      });
    }
    return this.memeLoopRuntime;
  }

  /** Main-process durable runtime used by authenticated Device RPC. */
  public getDurableAgentRuntime(): Promise<MemeLoopRuntime> {
    this.ensureRepositories();
    return this.getMemeLoopRuntime().getCoreRuntime(new DesktopAgentRunStateStore(this.dataSource!));
  }

  /** Idempotently materialize Core's requested conversation identity in the Desktop projection. */
  public async ensureAgentConversation(definitionId: string, conversationId?: string): Promise<{ conversationId: string }> {
    if (conversationId) {
      const existing = await this.getAgentMetadata(conversationId);
      if (existing) {
        if (existing.agentDefId !== definitionId) throw new Error('agent conversation definition mismatch');
        return { conversationId };
      }
    }
    const created = await this.createAgent(definitionId, conversationId ? { id: conversationId } : undefined);
    return { conversationId: created.id };
  }

  private async updateAgentStatusBestEffort(agentId: string, status: AgentInstanceLatestStatus): Promise<void> {
    if (!this.agentInstanceRepository || !this.agentMessageRepository) {
      return;
    }

    try {
      await this.updateAgent(agentId, { status });
    } catch (error) {
      const currentAgent = await this.getAgentMetadata(agentId).catch(() => undefined);
      if (!currentAgent) throw error;
      this.notifyAgentUpdate(agentId, { ...currentAgent, status });
      logger.warn('Failed to persist agent status during MemeLoop turn; continuing with bounded in-memory status', { error, agentId, state: status.state });
    }
  }

  private persistDurableRunError(status: MemeLoopRunStatus): Promise<void> {
    const runError = status.error;
    if (!runError) return Promise.resolve();
    const existing = this.durableErrorPersistence.get(status.runId);
    if (existing) return existing;
    const pending = (async () => {
      const messageId = `agent-run-error:${status.runId}`;
      const existingMessage = await this.getAgentMessage(messageId).catch(() => undefined);
      if (existingMessage?.conversationId === status.conversationId) return;
      const originNodeId = (await this.deviceNetworkService.getLocalIdentity()).peerId;
      const event = await this.appendLocalConversationEvent({
        kind: 'message',
        eventId: messageId,
        conversationId: status.conversationId,
        originNodeId,
        timestamp: status.finishedAt ?? status.updatedAt,
        message: {
          messageId,
          turnId: status.turnId,
          role: 'error',
          content: runError.messageKey,
          duration: 1,
          metadata: { agentRunError: runError, runId: status.runId },
        },
      });
      if (event.kind !== 'message') throw new Error('durable error append returned a non-message event');
    })().catch((error: unknown) => {
      logger.warn('Failed to persist durable MemeLoop error message', {
        conversationId: status.conversationId,
        runId: status.runId,
        error,
      });
    });
    this.durableErrorPersistence.set(status.runId, pending);
    void pending.finally(() => {
      if (this.durableErrorPersistence.get(status.runId) === pending) this.durableErrorPersistence.delete(status.runId);
    });
    return pending;
  }

  /**
   * Clean up subscriptions for specific agent
   */
  private cleanupAgentSubscriptions(agentId: string): void {
    this.agentInstanceSubjects.get(agentId)?.complete();
    this.agentInstanceSubjects.delete(agentId);
    this.conversationSubjects.get(agentId)?.complete();
    this.conversationSubjects.delete(agentId);
    this.conversationInvalidationWatermarks.delete(agentId);
    this.conversationInvalidationQueues.delete(agentId);

    // Clean up all status subscriptions related to this agent
    for (const [key, _] of this.statusSubjects.entries()) {
      if (key.startsWith(`${agentId}:`)) {
        this.statusSubjects.get(key)?.complete();
        this.statusSubjects.delete(key);
      }
    }
  }

  public async createAgent(agentDefinitionID?: string, options?: { id?: string; preview?: boolean; volatile?: boolean }): Promise<AgentRuntimeView> {
    this.ensureRepositories();
    try {
      const agent = await repo.createAgent(this.agentInstanceRepository!, this.agentDefinitionService, agentDefinitionID, options);
      const originNodeId = (await this.deviceNetworkService.getLocalIdentity()).peerId;
      await this.appendLocalConversationEvent({
        kind: 'metadataPatch',
        eventId: `metadata:create:${agent.id}`,
        conversationId: agent.id,
        originNodeId,
        timestamp: agent.created.getTime(),
        patch: {
          title: agent.name ?? agent.agentDefId,
          definitionId: agent.agentDefId,
          isUserInitiated: !agent.volatile,
        },
      });
      return agent;
    } catch (error) {
      logger.error('Failed to create agent instance', { error });
      throw error;
    }
  }

  public async getAgentMetadata(agentId: string): Promise<AgentRuntimeView | undefined> {
    this.ensureRepositories();
    return repo.getAgentMetadata(this.agentInstanceRepository!, agentId);
  }

  public async getAgentMessagePage(
    agentId: string,
    options: AgentConversationMessagePageOptions,
  ): Promise<AgentConversationMessagePage> {
    const page = await this.getAgentStorageMessagePage(agentId, agentConversationPageOptionsToStorage(options));
    return storagePageToAgentConversationPage(agentId, page, options);
  }

  public async getAgentStorageMessagePage(agentId: string, options: GetMessagePageOptions): Promise<ConversationMessagePage> {
    this.ensureRepositories();
    return repo.getMessagePage(this.agentMessageRepository!, agentId, options);
  }

  public async getAgentStorageFullContentMessagePage(
    agentId: string,
    options: GetFullContentMessagePageOptions,
  ): Promise<ConversationFullContentMessagePage> {
    this.ensureRepositories();
    return repo.getFullContentMessagePage(this.agentMessageRepository!, agentId, options);
  }

  public async getAgentMessageIdentity(
    agentId: string,
    messageId: string,
  ): Promise<ConversationMessageIdentity | null> {
    this.ensureRepositories();
    return repo.getMessageIdentity(this.dataSource!, agentId, messageId);
  }

  public async readAgentMessageDetailRange(
    agentId: string,
    messageId: string,
    offset: number,
    maxBytes: number,
  ): Promise<ConversationMessageDetailRange> {
    this.ensureRepositories();
    return repo.readMessageDetailRange(this.dataSource!, agentId, messageId, offset, maxBytes);
  }

  public async readAgentMessageReasoningRange(
    agentId: string,
    messageId: string,
    offset: number,
    maxBytes: number,
  ): Promise<ConversationMessageDetailRange> {
    this.ensureRepositories();
    return repo.readMessageReasoningRange(this.dataSource!, agentId, messageId, offset, maxBytes);
  }

  public async getAgentMessageWindowAround(
    request: AgentConversationMessageWindowRequest,
  ): Promise<AgentConversationMessageWindowResult> {
    const result = await this.getAgentStorageMessageWindowAround(
      request.conversationId,
      agentConversationWindowRequestToStorage(request),
    );
    return storageWindowToAgentConversationWindow(request, result);
  }

  public async getAgentStorageMessageWindowAround(
    agentId: string,
    options: GetConversationMessageWindowAroundOptions,
  ): Promise<ConversationMessageWindowResult> {
    this.ensureRepositories();
    return repo.getMessageWindowAround(this.dataSource!, agentId, options);
  }

  public async conversationReferencesAttachment(agentId: string, contentHash: string): Promise<boolean> {
    this.ensureRepositories();
    return repo.conversationReferencesAttachment(this.dataSource!, agentId, contentHash);
  }

  public async getAgentConversationListPage(
    localNodeId: string,
    options: GetConversationListPageOptions,
  ): Promise<ConversationListPage> {
    this.ensureRepositories();
    return repo.getConversationListPage(this.dataSource!, localNodeId, options);
  }

  public async getAgentConversationMeta(localNodeId: string, conversationId: string): Promise<import('memeloop').ConversationMeta | null> {
    this.ensureRepositories();
    return repo.getConversationMeta(this.dataSource!, localNodeId, conversationId);
  }

  public async getAgentConversationListPageScoped(
    localNodeId: string,
    options: GetConversationListPageOptions,
    scope: repo.ConversationListProjectionScope,
  ): Promise<ConversationListPage> {
    this.ensureRepositories();
    return repo.getConversationListPage(this.dataSource!, localNodeId, options, scope);
  }

  public async getAgentConversationTimelinePage(
    agentId: string,
    options: GetConversationTimelinePageOptions,
  ): Promise<ConversationTimelinePage> {
    this.ensureRepositories();
    return repo.getConversationTimelinePage(this.agentMessageRepository!, agentId, options);
  }

  public async getMaxAgentLamportClock(agentId: string): Promise<number> {
    this.ensureRepositories();
    return repo.getMaxLamportClock(this.agentMessageRepository!, agentId);
  }

  public async getExistingAgentMessageIds(agentId: string, messageIds: string[]): Promise<string[]> {
    this.ensureRepositories();
    return repo.getExistingMessageIds(this.agentMessageRepository!, agentId, messageIds);
  }

  public async getAgentMessage(messageId: string): Promise<ChatMessage | undefined> {
    this.ensureRepositories();
    return repo.getMessage(this.agentMessageRepository!, messageId);
  }

  public async getAgentTurnDetail(
    request: AgentDeviceRpcGetTurnDetailRequest,
  ): Promise<AgentDeviceRpcGetTurnDetailResponse> {
    this.ensureRepositories();
    return repo.getTurnDetail(this.agentMessageRepository!, request);
  }

  public async deleteConversationTurn(
    request: AgentDeviceRpcDeleteTurnRequest,
  ): Promise<AgentDeviceRpcDeleteTurnResponse> {
    this.ensureRepositories();
    const subjectActive = this.conversationSubjects.has(request.conversationId);
    const previousState = subjectActive ? await this.getConversationState(request.conversationId) : { revision: '0', totalMessages: 0 };
    const originNodeId = (await this.deviceNetworkService.getLocalIdentity()).peerId;
    const tombstone = await repo.appendDeleteTurnTombstoneAtomic(this.dataSource!, request, originNodeId);
    if (subjectActive) {
      await this.publishConversationInvalidation(request.conversationId, previousState, 'tombstone');
    }
    return {
      ok: true,
      conversationId: request.conversationId,
      turnId: request.turnId,
      requestId: request.requestId,
      tombstone,
    };
  }

  public async retryConversationTurn(
    request: AgentDeviceRpcRetryTurnRequest,
  ): Promise<AgentDeviceRpcRetryTurnResponse> {
    this.ensureRepositories();
    const subjectActive = this.conversationSubjects.has(request.conversationId);
    const previousState = subjectActive ? await this.getConversationState(request.conversationId) : { revision: '0', totalMessages: 0 };
    const requestPeerId = (await this.deviceNetworkService.getLocalIdentity()).peerId;
    const result = await (await this.getDurableAgentRuntime()).retryTurn({ ...request, requestPeerId });
    if (subjectActive) {
      // Core's atomic retry writes directly through the run-state store, so it
      // deliberately bypasses appendLocalConversationEventsAtomic. Publish one
      // reset edge for the tombstone + replacement root before later run output.
      await this.publishConversationInvalidation(request.conversationId, previousState, 'reset');
    }
    return {
      ok: true,
      ...result.handle,
      tombstone: result.tombstone,
      userEvent: result.userEvent,
    };
  }

  public async getLatestContextCompactionSummary(agentId: string): Promise<ChatMessage | undefined> {
    this.ensureRepositories();
    return repo.getLatestContextCompactionSummary(this.agentMessageRepository!, agentId);
  }

  public async getAgentCompactionCandidatePage(
    agentId: string,
    options: GetCompactionCandidatePageOptions,
  ): Promise<CompactionCandidatePage> {
    this.ensureRepositories();
    return repo.getCompactionCandidatePage(this.dataSource!, agentId, options);
  }

  public async getAgentRetainedCompactionControls(
    agentId: string,
    options: GetRetainedCompactionControlsOptions,
  ): Promise<RetainedCompactionControlPage> {
    this.ensureRepositories();
    return repo.getRetainedCompactionControls(this.dataSource!, agentId, options);
  }

  /**
   * Seed a realistically large durable transcript for packaged renderer E2E.
   *
   * This intentionally uses the same canonical remote-merge path as device
   * sync. It therefore creates raw events, message/detail projections, sparse
   * timeline checkpoints and revision invalidations exactly as production
   * would. Only the small fixture request crosses IPC; transcript bytes are
   * constructed and retained in the main process.
   */
  public async seedLongConversationForE2E(input: {
    conversationId: string;
    turnCount: number;
  }): Promise<{
    conversationId: string;
    turnCount: number;
    messageCount: number;
    compactionCount: number;
  }> {
    if (!isTest || process.env.E2E_TEST !== 'true') {
      throw new Error('seedLongConversationForE2E is available only in packaged E2E');
    }
    if (
      typeof input?.conversationId !== 'string' || input.conversationId.length === 0 || input.conversationId.length > 512 ||
      !Number.isSafeInteger(input.turnCount) || input.turnCount < 1 || input.turnCount > 20_000
    ) {
      throw new TypeError('invalid long-conversation E2E seed request');
    }
    this.ensureRepositories();
    const owner = await this.agentInstanceRepository!.findOne({ where: { id: input.conversationId } });
    if (!owner) throw new Error('long-conversation E2E seed owner was not found');

    const previousState = await this.getConversationState(input.conversationId);
    const baseTimestamp = 1_700_000_000_000;
    const messageOrigins = Array.from(
      { length: 3 },
      (_, index) => `e2e-long-messages-${index + 1}:${input.conversationId}`,
    );
    const messageOriginSequences = [0, 0, 0];
    const messageOriginTurnCounts = [0, 0, 0];
    const compactionOrigin = `e2e-long-compactions:${input.conversationId}`;
    const summaryTurnIndexes = [
      ...new Set([
        Math.min(input.turnCount - 1, Math.max(0, Math.ceil(input.turnCount / 3) - 1)),
        Math.min(input.turnCount - 1, Math.max(0, Math.ceil(input.turnCount * 2 / 3) - 1)),
        // Leave exactly the default 32-turn recent tail uncovered. This
        // proves the model-request path combines retained semantic summaries
        // with recent history without making an unrelated provider call.
        Math.max(0, input.turnCount - 33),
      ]),
    ];
    const summaryAt = new Map(summaryTurnIndexes.map((turnIndex, index) => [turnIndex, index]));
    const events: ConversationEvent[] = [];

    for (let turnIndex = 0; turnIndex < input.turnCount; turnIndex++) {
      const originIndex = Math.min(2, Math.floor(turnIndex * 3 / input.turnCount));
      const messageOrigin = messageOrigins[originIndex];
      const number = turnIndex.toString().padStart(5, '0');
      const turnId = `e2e-long-user:${input.conversationId}:${number}`;
      const userSequence = messageOriginSequences[originIndex] + 1;
      const assistantSequence = userSequence + 1;
      messageOriginSequences[originIndex] = assistantSequence;
      messageOriginTurnCounts[originIndex] += 1;
      const timestamp = baseTimestamp + turnIndex * 4;
      events.push(
        {
          kind: 'message',
          eventId: `e2e-long-user:${input.conversationId}:${number}`,
          conversationId: input.conversationId,
          originNodeId: messageOrigin,
          originSequence: userSequence,
          lamportClock: turnIndex * 4 + 1,
          timestamp,
          message: {
            messageId: `e2e-long-user:${input.conversationId}:${number}`,
            turnId,
            role: 'user',
            content: `E2E long question ${number}`,
          },
        },
        {
          kind: 'message',
          eventId: `e2e-long-assistant:${input.conversationId}:${number}`,
          conversationId: input.conversationId,
          originNodeId: messageOrigin,
          originSequence: assistantSequence,
          lamportClock: turnIndex * 4 + 2,
          timestamp: timestamp + 1,
          message: {
            messageId: `e2e-long-assistant:${input.conversationId}:${number}`,
            turnId,
            role: 'assistant',
            content: `E2E long answer ${number}`,
          },
        },
      );

      const summaryIndex = summaryAt.get(turnIndex);
      if (summaryIndex !== undefined) {
        // Keep the three summaries causally incomparable (one origin each),
        // exactly like concurrent compaction on independent devices. Core
        // must retain and merge all three until a later semantic summary
        // explicitly dominates them.
        const coveredVersion = { [messageOrigin]: messageOriginSequences[originIndex] };
        const coveredMessageCountByOrigin = { ...coveredVersion };
        const coveredUserTurnCountByOrigin = { [messageOrigin]: messageOriginTurnCounts[originIndex] };
        const droppedMessageCount = coveredMessageCountByOrigin[messageOrigin];
        const droppedTurnCount = coveredUserTurnCountByOrigin[messageOrigin];
        events.push({
          kind: 'compaction',
          mode: 'summary',
          eventId: `e2e-long-compaction-event:${input.conversationId}:${summaryIndex + 1}`,
          conversationId: input.conversationId,
          originNodeId: compactionOrigin,
          originSequence: summaryIndex + 1,
          lamportClock: turnIndex * 4 + 3,
          timestamp: timestamp + 2,
          boundary: {
            version: 2,
            coveredVersion,
            coveredMessageCountByOrigin,
            coveredUserTurnCountByOrigin,
            droppedMessageCount,
            droppedTurnCount,
          },
          summary: {
            turnId: `e2e-long-compaction-turn:${input.conversationId}:${summaryIndex + 1}`,
            content: `E2E durable compaction summary ${summaryIndex + 1}`,
          },
        });
      }
    }

    await repo.insertConversationEventsIfAbsent(this.dataSource!, events);
    await this.publishConversationInvalidation(input.conversationId, previousState, 'reset');
    return {
      conversationId: input.conversationId,
      turnCount: input.turnCount,
      messageCount: input.turnCount * 2,
      compactionCount: summaryTurnIndexes.length,
    };
  }

  public async appendLocalConversationEvent(draft: ConversationEventDraft): Promise<ConversationEvent> {
    this.ensureRepositories();
    const subjectActive = this.conversationSubjects.has(draft.conversationId);
    const previousState = subjectActive ? await this.getConversationState(draft.conversationId) : { revision: '0', totalMessages: 0 };
    const event = await repo.appendLocalConversationEvent(this.dataSource!, draft);
    if (subjectActive) {
      if (event.kind === 'message') {
        await this.publishConversationMessage(conversationEventToMessage(event), false, previousState);
      } else if (event.kind === 'compaction') {
        await this.publishConversationInvalidation(event.conversationId, previousState, 'compaction');
      } else if (event.kind === 'tombstone') {
        await this.publishConversationInvalidation(event.conversationId, previousState, 'tombstone');
      }
    }
    return event;
  }

  public async appendLocalConversationEventsAtomic(drafts: readonly ConversationEventDraft[]): Promise<ConversationEvent[]> {
    this.ensureRepositories();
    const activeConversationIds = [...new Set(drafts.map(draft => draft.conversationId))]
      .filter(conversationId => this.conversationSubjects.has(conversationId));
    const previousStates = new Map(
      await Promise.all(activeConversationIds.map(async conversationId =>
        [
          conversationId,
          await this.getConversationState(conversationId),
        ] as const
      )),
    );
    const events = await repo.appendLocalConversationEventsAtomic(this.dataSource!, drafts);
    await Promise.all(activeConversationIds.map(conversationId => this.publishConversationInvalidation(conversationId, previousStates.get(conversationId)!, 'append')));
    return events;
  }

  public async insertConversationEventsIfAbsent(events: readonly ConversationEvent[]): Promise<void> {
    this.ensureRepositories();
    const activeConversationIds = [...new Set(events.map(event => event.conversationId))]
      .filter(conversationId => this.conversationSubjects.has(conversationId));
    const previousStates = new Map(
      await Promise.all(activeConversationIds.map(async conversationId =>
        [
          conversationId,
          await this.getConversationState(conversationId),
        ] as const
      )),
    );
    await repo.insertConversationEventsIfAbsent(this.dataSource!, events);
    await Promise.all(activeConversationIds.map(conversationId => {
      const conversationEvents = events.filter(event => event.conversationId === conversationId);
      const appendOnly = conversationEvents.some(event => event.kind === 'message') &&
        conversationEvents.every(event => event.kind === 'message' || event.kind === 'metadataPatch');
      return this.publishConversationInvalidation(
        conversationId,
        previousStates.get(conversationId)!,
        appendOnly ? 'append' : 'reset',
      );
    }));
  }

  public async getConversationEventPage(
    agentId: string,
    options: GetConversationEventPageOptions,
  ): Promise<ConversationEventPage> {
    this.ensureRepositories();
    return repo.getConversationEventPage(this.dataSource!, agentId, options);
  }

  public async getConversationEventVersionFrontiers(agentIds?: readonly string[]): Promise<MessageVersionFrontier[]> {
    this.ensureRepositories();
    return repo.getEventVersionFrontiers(this.dataSource!, agentIds);
  }

  public async getConversationEventVersionFrontierPage(options: {
    limit: number;
    after?: MessageVersionFrontierCursor;
    conversationIds?: readonly string[];
  }): Promise<MessageVersionFrontierPage> {
    this.ensureRepositories();
    return repo.getEventVersionFrontierPage(this.dataSource!, options);
  }

  public async getConversationEventVersionFrontiersForKeys(
    keys: readonly MessageVersionFrontierCursor[],
  ): Promise<MessageVersionFrontier[]> {
    this.ensureRepositories();
    return repo.getEventVersionFrontiersForKeys(this.dataSource!, keys);
  }

  public async updateAgent(agentId: string, data: AgentInstanceMetadataUpdate): Promise<AgentRuntimeView> {
    this.ensureRepositories();
    try {
      const updatedAgent = await repo.updateAgent(this.agentInstanceRepository!, this.agentMessageRepository!, agentId, data);
      this.notifyAgentUpdate(agentId, updatedAgent);
      return updatedAgent;
    } catch (error) {
      logger.error('Failed to update agent instance', { error });
      throw error;
    }
  }

  public async deleteAgent(agentId: string): Promise<void> {
    this.ensureRepositories();
    try {
      stopHeartbeat(agentId);
      await (await this.getDurableAgentRuntime()).cancelAgent(agentId);
      await cancelTasksForAgent(agentId);
      await cleanupMCPClient(agentId);
      await repo.deleteAgent(this.agentInstanceRepository!, this.agentMessageRepository!, agentId);
      this.cleanupAgentSubscriptions(agentId);
    } catch (error) {
      logger.error('Failed to delete agent instance', { error });
      throw error;
    }
  }

  public async discardVolatileAgentPreview(input: repo.DiscardVolatileAgentPreviewInput): Promise<void> {
    this.ensureRepositories();
    const agentId = input.agentId?.trim();
    const temporaryDefinitionId = input.temporaryDefinitionId?.trim();
    try {
      if (temporaryDefinitionId && !temporaryDefinitionId.startsWith('temp-')) {
        throw new Error(`Refusing to discard non-temporary agent definition: ${temporaryDefinitionId}`);
      }
      // Fail before mutating runtime state when the renderer points at a
      // durable conversation. The repository repeats this check atomically.
      if (agentId) {
        const instance = await this.agentInstanceRepository!.findOne({ where: { id: agentId } });
        if (instance && (!instance.volatile || !instance.preview)) {
          throw new Error(`Refusing to discard non-preview or non-volatile agent instance: ${agentId}`);
        }
        if (instance && temporaryDefinitionId && instance.agentDefId !== temporaryDefinitionId) {
          throw new Error('Volatile preview does not belong to the supplied temporary definition');
        }
        if (instance) {
          stopHeartbeat(agentId);
          await (await this.getDurableAgentRuntime()).cancelAgent(agentId);
          await cancelTasksForAgent(agentId);
          await cleanupMCPClient(agentId);
          await this.attachmentUploadStore?.releaseConversationScope(agentId);
        }
      }

      await repo.discardVolatileAgentPreview(this.dataSource!, input);
      if (agentId) {
        this.activeDurableRunIds.delete(agentId);
        this.cleanupAgentSubscriptions(agentId);
      }
    } catch (error) {
      logger.error('Failed to discard volatile agent preview', { error, ...input });
      throw error;
    }
  }

  public async getAgents(
    page: number,
    pageSize: number,
    options?: { closed?: boolean; searchName?: string },
  ): Promise<AgentInstanceMetadata[]> {
    this.ensureRepositories();
    try {
      return await repo.getAgents(this.agentInstanceRepository!, page, pageSize, options);
    } catch (error) {
      logger.error('Failed to get agent instances', { error });
      throw error;
    }
  }

  public async executeLocalAgentMessage(
    remoteRequest: RemoteAgentExecuteRequest,
    options?: AgentManagementCallOptions,
  ): Promise<MemeLoopRunStatus> {
    if (remoteRequest.target.kind !== 'local') throw new Error('local agent execution requires a local target');
    const { conversationId: agentId, definitionId, requestId, turnId } = remoteRequest.provenance;
    const agent = await this.getAgentMetadata(agentId);
    if (!agent) throw new Error(`Agent instance not found: ${agentId}`);
    if (agent.agentDefId !== definitionId) throw new Error('agent conversation definition mismatch');
    const definition = await this.agentDefinitionService.getAgentDef(agent.agentDefId);
    if (!definition) throw new Error(`Agent definition not found: ${agent.agentDefId}`);
    if (remoteRequest.attachment?.kind === 'committed') {
      await this.assertAgentAttachmentAuthorized(agentId, remoteRequest.attachment.reference, false);
    }

    const requestPeerId = (await this.deviceNetworkService.getLocalIdentity()).peerId;
    const existingUserRoot = await this.getAgentMessage(turnId).catch(() => undefined);
    const prepared = existingUserRoot?.conversationId === agentId && existingUserRoot.role === 'user'
      ? this.runTurnRequestFromPersistedUserRoot({
        conversationId: agentId,
        definitionId: agent.agentDefId,
        message: remoteRequest.message,
        requestId,
        turnId,
      }, existingUserRoot)
      : await this.createAgentDeviceRpcRunTurn(
        remoteRequest,
        await this.captureBeforeTurnCommitMap(agentId),
      );

    await this.updateAgentStatusBestEffort(agentId, { state: 'working', modified: new Date() });
    let handle: MemeLoopRunHandle | undefined;
    let terminalStatusPersisted = false;
    const inputRequiredRunIds = new Set<string>();
    const durableRuntime = await this.getDurableAgentRuntime();
    const unsubscribeRuntime = durableRuntime.subscribeToUpdates(agentId, update => {
      if (update.type !== 'agent-step' || update.runId === undefined || update.step.type !== 'thinking') return;
      const data = update.step.data;
      if (data && typeof data === 'object' && 'status' in data && data.status === 'input-required') {
        inputRequiredRunIds.add(update.runId);
      }
    });
    try {
      handle = await durableRuntime.sendMessage({
        ...prepared,
        requestPeerId,
        ...(prepared.userMessage === undefined ? {} : {
          userMessage: {
            ...prepared.userMessage,
            messageId: turnId,
            turnId,
            originNodeId: requestPeerId,
          },
        }),
      });
      this.trackDurableRun(agentId, handle.runId);
      if (remoteRequest.attachment?.kind === 'committed') {
        this.getAttachmentUploadStore().consumeCommittedScope(agentId, remoteRequest.attachment.reference);
      }
      const terminal = await this.waitForDurableRun(handle.runId, options?.signal);
      if (terminal.state === 'failed') {
        await this.updateAgentStatusBestEffort(agentId, { state: 'failed', modified: new Date() });
        terminalStatusPersisted = true;
        throw this.createDurableRunFailure(terminal);
      }
      if (terminal.state === 'cancelled') {
        await this.updateAgentStatusBestEffort(agentId, { state: 'canceled', modified: new Date() });
        terminalStatusPersisted = true;
        throw new Error('agent_run_cancelled');
      }
      // askQuestion yields an input-required step while the durable transport
      // lifecycle correctly reaches completed. Correlate the step to this
      // exact run instead of inferring it from mutable conversation data.
      const completedState = inputRequiredRunIds.has(handle.runId) ? 'input-required' : 'completed';
      await this.updateAgentStatusBestEffort(agentId, { state: completedState, modified: new Date() });
      if (definition.heartbeat?.enabled && !agent.volatile) {
        startHeartbeat(agentId, definition.id, definition.heartbeat, this, { createdBy: 'agent-definition' });
      }
      return terminal;
    } catch (error) {
      if (!terminalStatusPersisted) {
        if (options?.signal?.aborted) {
          if (handle) await durableRuntime.cancelRun(handle.runId);
          await this.updateAgentStatusBestEffort(agentId, { state: 'canceled', modified: new Date() });
        } else {
          await this.updateAgentStatusBestEffort(agentId, { state: 'failed', modified: new Date() });
        }
      }
      throw error;
    } finally {
      unsubscribeRuntime();
      if (handle) this.untrackDurableRun(agentId, handle.runId);
    }
  }

  private async captureBeforeTurnCommitMap(agentId: string): Promise<Record<string, { wikiFolderLocation: string; commitHash: string }>> {
    const beforeCommitMap: Record<string, { wikiFolderLocation: string; commitHash: string }> = {};
    try {
      for (const workspace of await this.workspaceService.getWorkspacesAsList()) {
        if (!isWikiWorkspace(workspace)) continue;
        try {
          const commitHash = await this.gitService.callGitOpForWorkspace(workspace.id, 'getHeadCommitHash', workspace.wikiFolderLocation);
          beforeCommitMap[workspace.id] = { wikiFolderLocation: workspace.wikiFolderLocation, commitHash };
        } catch {
          // A workspace without a Git HEAD cannot participate in rollback.
        }
      }
      logger.debug('Recorded before-turn commit hashes', { agentId, workspaceCount: Object.keys(beforeCommitMap).length });
    } catch (error) {
      logger.warn('Failed to record before-turn commit hashes', { agentId, error });
    }
    return beforeCommitMap;
  }

  private async waitForDurableRun(runId: string, signal?: AbortSignal): Promise<MemeLoopRunStatus> {
    const runtime = await this.getDurableAgentRuntime();
    let cancellationRequested = false;
    const cancel = () => {
      if (cancellationRequested) return;
      cancellationRequested = true;
      void runtime.cancelRun(runId);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      for (;;) {
        signal?.throwIfAborted();
        const status = await runtime.getRunStatus(runId);
        signal?.throwIfAborted();
        if (!status) throw new Error('durable_agent_run_disappeared');
        if (status.state === 'failed') await this.persistDurableRunError(status);
        if (status.state === 'completed' || status.state === 'failed' || status.state === 'cancelled') return status;
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            clearTimeout(timer);
            reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
          };
          const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
          }, 100);
          signal?.addEventListener('abort', onAbort, { once: true });
        });
      }
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  }

  private runTurnRequestFromPersistedUserRoot(
    request: Omit<AgentDeviceRpcRunTurnRequest, 'userMessage'>,
    message: ChatMessage,
  ): AgentDeviceRpcRunTurnRequest {
    return {
      ...request,
      message: message.content,
      userMessage: agentDeviceRpcPendingUserMessageFromChatMessage(message),
    };
  }

  private createDurableRunFailure(status: MemeLoopRunStatus): AgentRunFailure {
    return new AgentRunFailure(
      status.error ?? createAgentRunError({
        code: 'INTERNAL',
        messageKey: AGENT_RUN_ERROR_MESSAGE_KEYS.INTERNAL,
        retryable: false,
      }),
    );
  }

  private agentRunError(detail: AgentRunError): AgentRunFailure {
    return new AgentRunFailure(detail);
  }

  private trackDurableRun(conversationId: string, runId: string): void {
    const runIds = this.activeDurableRunIds.get(conversationId) ?? new Set<string>();
    runIds.add(runId);
    this.activeDurableRunIds.set(conversationId, runIds);
  }

  private untrackDurableRun(conversationId: string, runId: string): void {
    const runIds = this.activeDurableRunIds.get(conversationId);
    runIds?.delete(runId);
    if (runIds?.size === 0) this.activeDurableRunIds.delete(conversationId);
  }

  public async executeAgentRun(request: AgentDeviceRpcRunTurnRequest): Promise<MemeLoopRunHandle> {
    const agent = await this.getAgentMetadata(request.conversationId);
    if (!agent || agent.agentDefId !== request.definitionId) {
      throw new Error('agent conversation definition mismatch');
    }
    const definition = await this.agentDefinitionService.getAgentDef(request.definitionId);
    if (!definition) throw new Error('agent definition not found');
    const instanceModel = agent.modelConfig;
    if (instanceModel === undefined && definition.modelConfig === undefined) {
      const globalModel = (await this.externalAPIService.getAIConfig()).default;
      if (!globalModel?.providerId || !globalModel.modelId) {
        throw this.agentRunError(createAgentRunError({
          code: 'PROVIDER_CONFIGURATION_MISSING',
          messageKey: AGENT_RUN_ERROR_MESSAGE_KEYS.PROVIDER_CONFIGURATION_MISSING,
          retryable: false,
          localizedParams: { settingField: 'model' },
          settingTarget: { kind: 'runtime', section: 'agent' },
        }));
      }
    }
    const requestPeerId = (await this.deviceNetworkService.getLocalIdentity()).peerId;
    for (const reference of request.userMessage?.attachments ?? []) {
      await this.assertAgentAttachmentAuthorized(request.conversationId, reference, false);
    }
    const handle = await (await this.getDurableAgentRuntime()).sendMessage({
      ...request,
      requestPeerId,
      ...(request.userMessage === undefined
        ? {}
        : {
          userMessage: {
            ...request.userMessage,
            messageId: request.turnId,
            turnId: request.turnId,
            originNodeId: requestPeerId,
          },
        }),
    });
    for (const reference of request.userMessage?.attachments ?? []) {
      this.getAttachmentUploadStore().consumeCommittedScope(request.conversationId, reference);
    }
    return handle;
  }

  public async prepareAgentDeviceRpcRunTurn(request: RemoteAgentExecuteRequest): Promise<AgentDeviceRpcRunTurnRequest> {
    const { provenance } = request;
    const agent = await this.getAgentMetadata(provenance.conversationId);
    if (!agent || agent.agentDefId !== provenance.definitionId) {
      throw new Error('agent conversation definition mismatch');
    }
    if (request.attachment?.kind === 'source') {
      throw new TypeError('attachment source must be committed before crossing the Desktop host boundary');
    }
    if (request.attachment?.kind === 'committed') {
      await this.assertAgentAttachmentAuthorized(provenance.conversationId, request.attachment.reference, false);
    }
    return this.createAgentDeviceRpcRunTurn(request);
  }

  public async getAgentRunStatus(runId: string): Promise<MemeLoopRunStatus | undefined> {
    const status = await (await this.getDurableAgentRuntime()).getRunStatus(runId);
    if (status?.state === 'failed') await this.persistDurableRunError(status);
    return status;
  }

  public async cancelAgentRun(runId: string): Promise<boolean> {
    return (await this.getDurableAgentRuntime()).cancelRun(runId);
  }

  private async assertAgentAttachmentAuthorized(
    conversationId: string,
    reference: AttachmentReference,
    consumeCommittedScope: boolean,
  ): Promise<void> {
    this.ensureRepositories();
    const storedReference = await this.getAttachmentUploadStore().getReference(reference.contentHash);
    if (
      !storedReference || storedReference.contentHash !== reference.contentHash ||
      storedReference.filename !== reference.filename || storedReference.mimeType !== reference.mimeType ||
      storedReference.size !== reference.size
    ) throw new Error('attachment blob does not match its event-scoped reference');
    const hasCommittedScope = consumeCommittedScope
      ? this.getAttachmentUploadStore().consumeCommittedScope(conversationId, reference)
      : this.getAttachmentUploadStore().hasCommittedScope(conversationId, reference);
    const alreadyReferenced = hasCommittedScope
      ? false
      : await repo.conversationReferencesAttachment(this.dataSource!, conversationId, reference.contentHash, reference);
    if (!hasCommittedScope && !alreadyReferenced) {
      throw new Error('attachment is not authorized for this conversation');
    }
  }

  private async createAgentDeviceRpcRunTurn(
    request: RemoteAgentExecuteRequest,
    beforeCommitMap?: Record<string, { wikiFolderLocation: string; commitHash: string }>,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<AgentDeviceRpcRunTurnRequest> {
    const { provenance } = request;
    const userMessage = await createAgentDeviceRpcPendingUserMessage({
      request,
      beforeCommitMap,
      metadata,
    });
    return {
      conversationId: provenance.conversationId,
      definitionId: provenance.definitionId,
      requestId: provenance.requestId,
      turnId: provenance.turnId,
      message: userMessage.content ?? request.message,
      userMessage,
    };
  }

  public async cancelAgent(agentId: string): Promise<void> {
    stopHeartbeat(agentId);
    const durableRunIds = [...(this.activeDurableRunIds.get(agentId) ?? [])];
    await (await this.getDurableAgentRuntime()).cancelAgent(agentId);
    if (durableRunIds.length > 0) {
      try {
        await this.updateAgent(agentId, {
          status: {
            state: 'canceled',
            modified: new Date(),
          },
        });
        logger.info('Canceled agent instance', {
          function: 'cancelAgent',
          agentId,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to cancel agent instance', {
          function: 'cancelAgent',
          error: errorMessage,
        });
        throw error;
      }
    } else {
      logger.warn(`No active operation found for agent: ${agentId}`);
    }
  }

  public async closeAgent(agentId: string): Promise<void> {
    this.ensureRepositories();

    try {
      stopHeartbeat(agentId);
      await (await this.getDurableAgentRuntime()).cancelAgent(agentId);
      await cancelTasksForAgent(agentId);
      await cleanupMCPClient(agentId);

      // Get agent instance
      const instanceEntity = await this.agentInstanceRepository!.findOne({
        where: { id: agentId },
      });

      if (!instanceEntity) {
        throw new Error(`Agent instance not found: ${agentId}`);
      }

      // Mark as closed
      instanceEntity.closed = true;
      await this.agentInstanceRepository!.save(instanceEntity);

      // Clean up subscriptions
      this.cleanupAgentSubscriptions(agentId);

      logger.info('Closed agent instance', {
        function: 'closeAgent',
        agentId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to close agent instance', {
        function: 'closeAgent',
        error: errorMessage,
      });
      throw error;
    }
  }

  public async resolveToolApproval(resolution: ToolApprovalResolution): Promise<boolean> {
    return this.getMemeLoopRuntime().resolveToolApproval(resolution);
  }

  public async resolveAskQuestion(agentId: string, questionId: string, answer: string): Promise<void> {
    try {
      const agent = await this.getAgentMetadata(agentId);
      if (!agent) throw new Error(`Agent instance not found: ${agentId}`);
      await this.executeLocalAgentMessage({
        target: { kind: 'local' },
        provenance: {
          conversationId: agentId,
          definitionId: agent.agentDefId,
          requestId: `ask-question:${questionId}:request`,
          turnId: `ask-question:${questionId}:turn`,
        },
        message: answer,
      });
      logger.debug('Ask-question resolved via durable local run', { questionId, agentId });
    } catch (error) {
      logger.error('Failed to resolve ask-question', { questionId, error });
      throw error;
    }
  }

  public async getTurnChangedFiles(agentId: string, userMessageId: string): Promise<Array<{ path: string; status: string }>> {
    const userMessage = await this.getAgentMessage(userMessageId);
    if (!userMessage || userMessage.conversationId !== agentId) {
      throw new Error(`User message not found: ${userMessageId}`);
    }

    const beforeCommitMap = userMessage.metadata?.beforeCommitMap as Record<string, { wikiFolderLocation: string; commitHash: string }> | undefined;
    if (!beforeCommitMap || Object.keys(beforeCommitMap).length === 0) {
      return [];
    }

    const allChangedFiles: Array<{ path: string; status: string }> = [];
    for (const [workspaceId, { wikiFolderLocation, commitHash }] of Object.entries(beforeCommitMap)) {
      try {
        const changedFiles = await this.gitService.callGitOpForWorkspace(workspaceId, 'getChangedFilesBetweenCommits', wikiFolderLocation, commitHash);
        for (const file of changedFiles) {
          allChangedFiles.push({ path: file.path, status: file.status });
        }
      } catch (error) {
        logger.warn('Failed to get changed files for workspace', { wikiFolderLocation, error });
      }
    }

    return allChangedFiles;
  }

  public async rollbackTurn(agentId: string, userMessageId: string): Promise<{ rolledBack: number; errors: string[] }> {
    const userMessage = await this.getAgentMessage(userMessageId);
    if (!userMessage || userMessage.conversationId !== agentId) {
      throw new Error(`User message not found: ${userMessageId}`);
    }

    const beforeCommitMap = userMessage.metadata?.beforeCommitMap as Record<string, { wikiFolderLocation: string; commitHash: string }> | undefined;
    if (!beforeCommitMap || Object.keys(beforeCommitMap).length === 0) {
      return { rolledBack: 0, errors: ['No commit snapshot recorded for this turn'] };
    }

    let rolledBack = 0;
    const errors: string[] = [];
    for (const [workspaceId, { wikiFolderLocation, commitHash }] of Object.entries(beforeCommitMap)) {
      try {
        // Get the list of files that changed since the beforeCommitHash
        const changedFiles = await this.gitService.callGitOpForWorkspace(workspaceId, 'getChangedFilesBetweenCommits', wikiFolderLocation, commitHash);

        if (changedFiles.length === 0) continue;

        // Restore each file to its state at the beforeCommitHash
        for (const file of changedFiles) {
          try {
            await this.gitService.callGitOpForWorkspace(workspaceId, 'restoreFileFromCommit', wikiFolderLocation, commitHash, file.path);
            rolledBack++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`Failed to restore ${file.path}: ${errorMessage}`);
          }
        }

        logger.info('Rolled back files for workspace', { wikiFolderLocation, fileCount: changedFiles.length, rolledBack });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to get changed files for ${wikiFolderLocation}: ${errorMessage}`);
      }
    }

    // Mark the turn as rolled back in user message metadata.
    // Note: rollback restores files to working tree + staging area but does NOT create a new commit.
    // The next scheduled commitAndSync will commit the restored state as a new change.
    // Message events are immutable. A future annotation event can expose the
    // rollback marker without rewriting the canonical user message.

    return { rolledBack, errors };
  }

  public async setAgentHeartbeat(agentId: string, heartbeat: AgentHeartbeatConfig): Promise<void> {
    this.ensureRepositories();

    const entity = await this.agentInstanceRepository!.findOne({ where: { id: agentId } });
    if (!entity) {
      throw new Error(`Agent instance not found: ${agentId}`);
    }
    if (!entity.agentDefId) {
      throw new Error(`Agent definition not found for instance: ${agentId}`);
    }

    const agentDefinition = await this.agentDefinitionService.getAgentDef(entity.agentDefId);
    if (!agentDefinition) {
      throw new Error(`Agent definition not found: ${entity.agentDefId}`);
    }

    if (!Number.isSafeInteger(heartbeat.intervalSeconds) || heartbeat.intervalSeconds < 60 || heartbeat.message.trim().length === 0) {
      throw new TypeError('invalid agent heartbeat configuration');
    }

    await this.agentDefinitionService.updateAgentDef({
      id: agentDefinition.id,
      heartbeat,
    });

    if (heartbeat.enabled && !entity.volatile) {
      startHeartbeat(agentId, agentDefinition.id, heartbeat, this, { createdBy: 'settings-ui' });
    } else {
      stopHeartbeat(agentId);
    }

    logger.info('Background heartbeat upserted from UI', {
      agentId,
      enabled: heartbeat.enabled,
      intervalSeconds: heartbeat.intervalSeconds,
      activeHoursStart: heartbeat.activeHoursStart,
      activeHoursEnd: heartbeat.activeHoursEnd,
    });
  }

  // ── ScheduledTask CRUD ────────────────────────────────────────────────────

  public async createScheduledTask(input: CreateScheduledTaskInput, options?: AgentManagementCallOptions): Promise<ScheduledTask> {
    return stmAddTask(input, options);
  }

  public async updateScheduledTask(taskId: string, patch: ScheduledTaskRpcUpdatePatch, options?: AgentManagementCallOptions): Promise<ScheduledTask> {
    return stmUpdateTask(taskId, patch, options);
  }

  public async updateScheduledTaskScoped(
    scope: ScheduledTaskRpcScopedTaskRequest,
    patch: ScheduledTaskRpcUpdatePatch,
    options?: AgentManagementCallOptions,
  ): Promise<ScheduledTask> {
    return stmUpdateTaskScoped(scope, patch, options);
  }

  public async deleteScheduledTask(taskId: string): Promise<void> {
    return stmRemoveTask(taskId);
  }

  public async deleteScheduledTaskScoped(scope: ScheduledTaskRpcScopedTaskRequest, options?: AgentManagementCallOptions): Promise<void> {
    return stmRemoveTaskScoped(scope, options);
  }

  public async getScheduledTaskByScope(scope: ScheduledTaskRpcScopedTaskRequest, options?: AgentManagementCallOptions): Promise<ScheduledTask | undefined> {
    return stmGetTaskByScope(scope, options);
  }

  public async listScheduledTasks(options?: ListScheduledTasksOptions): Promise<ScheduledTask[]> {
    return stmGetActiveTasks(options);
  }

  public async listScheduledTasksForAgent(agentInstanceId: string, options?: ListScheduledTasksOptions): Promise<ScheduledTaskPage> {
    return stmGetScheduledTaskPageForAgent(agentInstanceId, options);
  }

  public async getCronPreviewDates(expression: string, timezone?: string, count = 3): Promise<string[]> {
    return stmGetCronPreviewDates(expression, timezone, count);
  }

  public subscribeToAgentUpdates(agentId: string): Observable<AgentRuntimeView | undefined>;
  /**
   * Subscribe to agent instance message status updates
   */
  public subscribeToAgentUpdates(agentId: string, messageId: string): Observable<AgentInstanceLatestStatus | undefined>;
  public subscribeToAgentUpdates(agentId: string, messageId?: string): Observable<AgentRuntimeView | AgentInstanceLatestStatus | undefined> {
    // If messageId provided, subscribe to specific message status updates
    if (messageId) {
      const statusKey = `${agentId}:${messageId}`;
      if (!this.statusSubjects.has(statusKey)) {
        this.statusSubjects.set(statusKey, new BehaviorSubject<AgentInstanceLatestStatus | undefined>(undefined));

        // Try to get initial status
        Promise.all([this.getAgentMetadata(agentId), this.getAgentMessage(messageId)]).then(([agent, message]) => {
          if (agent && message?.conversationId === agentId) {
            const status: AgentInstanceLatestStatus = {
              state: agent.status.state,
              message,
              modified: new Date(message.timestamp),
            };
            this.statusSubjects.get(statusKey)?.next(status);
          }
        }).catch((error: unknown) => {
          logger.error('Failed to get initial status for message', { function: 'subscribeToAgentUpdates', error });
        });
      }

      return this.statusSubjects.get(statusKey)!.asObservable();
    }

    // If no messageId is provided, emit metadata plus message deltas. The
    // renderer loads its initial bounded page explicitly; an observable must
    // never replay a complete or 200-message snapshot on every token update.
    if (!this.agentInstanceSubjects.has(agentId)) {
      this.agentInstanceSubjects.set(agentId, new BehaviorSubject<AgentRuntimeView | undefined>(undefined));

      // Try to get initial data
      this.getAgentMetadata(agentId).then(agent => {
        this.agentInstanceSubjects.get(agentId)?.next(agent);
      }).catch((error: unknown) => {
        logger.error('Failed to get initial agent data', { function: 'subscribeToAgentUpdates', error });
      });
    }

    return this.agentInstanceSubjects.get(agentId)!.asObservable();
  }

  public subscribeToConversationUpdates(conversationId: string): Observable<AgentConversationUpdate> {
    let subject = this.conversationSubjects.get(conversationId);
    if (!subject) {
      subject = new Subject<AgentConversationUpdate>();
      this.conversationSubjects.set(conversationId, subject);
    }
    return subject.asObservable();
  }

  private async getConversationState(conversationId: string): Promise<{ revision: string; totalMessages: number }> {
    this.ensureRepositories();
    const state = await this.dataSource!.getRepository(ConversationTimelineStateEntity).findOne({
      where: { conversationId },
      select: { revision: true, totalMessages: true },
    });
    return { revision: String(state?.revision ?? 0), totalMessages: state?.totalMessages ?? 0 };
  }

  private async getConversationRevision(conversationId: string): Promise<string> {
    return (await this.getConversationState(conversationId)).revision;
  }

  private toConversationProjection(message: ChatMessage, streaming = false): AgentConversationMessageProjection {
    return streaming
      ? projectTransientConversationMessageForList(message, 256 * 1024)
      : projectConversationMessageForList(message, 256 * 1024);
  }

  private async serializeConversationPublication(
    conversationId: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    const previousQueue = this.conversationInvalidationQueues.get(conversationId) ?? Promise.resolve();
    const nextQueue = previousQueue.catch(() => {}).then(operation);
    this.conversationInvalidationQueues.set(conversationId, nextQueue);
    try {
      await nextQueue;
    } finally {
      if (this.conversationInvalidationQueues.get(conversationId) === nextQueue) {
        this.conversationInvalidationQueues.delete(conversationId);
      }
    }
  }

  private async publishConversationMessage(
    message: ChatMessage,
    streaming: boolean,
    previousState?: { revision: string; totalMessages: number },
  ): Promise<void> {
    if (!this.conversationSubjects.has(message.conversationId)) return;
    const projection = this.toConversationProjection(message, streaming);
    if (streaming) {
      const subject = this.conversationSubjects.get(message.conversationId);
      if (!subject) return;
      subject.next({
        kind: 'projection',
        conversationId: message.conversationId,
        revision: await this.getConversationRevision(message.conversationId),
        streaming: true,
        message: projection,
      });
      return;
    }
    await this.serializeConversationPublication(message.conversationId, async () => {
      const subject = this.conversationSubjects.get(message.conversationId);
      if (!subject) return;
      const currentState = await this.getConversationState(message.conversationId);
      const baseline = this.conversationInvalidationWatermarks.get(message.conversationId) ?? previousState ?? currentState;
      if (Buffer.byteLength(JSON.stringify(projection), 'utf8') > 256 * 1024) {
        logger.warn('Skipped oversized live conversation projection; durable paging remains available', {
          conversationId: message.conversationId,
          messageId: message.messageId,
          streaming,
        });
        this.publishConversationInvalidationAtState(
          subject,
          message.conversationId,
          baseline,
          currentState,
          'append',
        );
        return;
      }
      subject.next({
        kind: 'projection',
        conversationId: message.conversationId,
        revision: currentState.revision,
        streaming: false,
        message: projection,
      });
      // A durable projection advances the same revision chain as an
      // invalidation. Without this watermark, the next invalidation would
      // advertise a stale previousRevision and force an avoidable reset.
      this.conversationInvalidationWatermarks.set(message.conversationId, currentState);
    });
  }

  private publishConversationInvalidationAtState(
    subject: Subject<AgentConversationUpdate>,
    conversationId: string,
    baseline: { revision: string; totalMessages: number },
    currentState: { revision: string; totalMessages: number },
    reason: Extract<AgentConversationUpdate, { kind: 'invalidated' }>['reason'],
  ): void {
    if (currentState.revision === baseline.revision) return;
    this.conversationInvalidationWatermarks.set(conversationId, currentState);
    if (reason === 'append') {
      const appendedMessageCount = currentState.totalMessages - baseline.totalMessages;
      const baselineRevision = Number(baseline.revision);
      const currentRevision = Number(currentState.revision);
      const revisionDelta = currentRevision - baselineRevision;
      if (
        Number.isSafeInteger(appendedMessageCount) && appendedMessageCount > 0 && appendedMessageCount <= 1_000_000 &&
        Number.isSafeInteger(baselineRevision) && Number.isSafeInteger(currentRevision) &&
        revisionDelta === appendedMessageCount
      ) {
        subject.next({
          kind: 'invalidated',
          conversationId,
          previousRevision: baseline.revision,
          revision: currentState.revision,
          reason,
          appendedMessageCount,
        });
        return;
      }
      reason = 'reset';
    }
    subject.next({
      kind: 'invalidated',
      conversationId,
      previousRevision: baseline.revision,
      revision: currentState.revision,
      reason,
    });
  }

  private async publishConversationInvalidation(
    conversationId: string,
    previousState: { revision: string; totalMessages: number },
    reason: Extract<AgentConversationUpdate, { kind: 'invalidated' }>['reason'],
  ): Promise<void> {
    if (!this.conversationSubjects.has(conversationId)) return;
    await this.serializeConversationPublication(conversationId, async () => {
      const subject = this.conversationSubjects.get(conversationId);
      if (!subject) return;
      const currentState = await this.getConversationState(conversationId);
      const baseline = this.conversationInvalidationWatermarks.get(conversationId) ?? previousState;
      this.publishConversationInvalidationAtState(subject, conversationId, baseline, currentState, reason);
    });
  }

  /**
   * Notify agent subscription of updates
   * @param agentId Agent ID
   * @param agentData Agent data to use for notification
   */
  private notifyAgentUpdate(agentId: string, agentData: AgentRuntimeView): void {
    try {
      // Only notify if there are active subscriptions
      if (this.agentInstanceSubjects.has(agentId)) {
        // Metadata subscriptions never carry transcript content. Conversation
        // projections use subscribeToConversationUpdates with revision fences.
        // Select the exact Core view instead of trusting TypeScript's erased
        // structural type: callers can otherwise leak an AgentInstanceModel's
        // unbounded `messages` array through this renderer IPC boundary.
        this.agentInstanceSubjects.get(agentId)?.next(projectAgentRuntimeView(agentData));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to notify agent update: ${errorMessage}`);
    }
  }

  public async saveUserMessage(userMessage: ChatMessage): Promise<void> {
    this.ensureRepositories();
    try {
      await this.insertConversationEventsIfAbsent([messageToConversationEvent(userMessage)]);
    } catch (error) {
      logger.error('Failed to save user message', {
        error,
        messageId: userMessage.messageId,
        agentId: userMessage.conversationId,
      });
      throw error;
    }
  }

  public debounceUpdateMessage(
    message: ChatMessage,
    agentId?: string,
    _debounceMs = 300,
  ): void {
    const messageId = message.messageId;

    // Update status subscribers for specific message if available
    if (agentId) {
      const statusKey = `${agentId}:${messageId}`;
      if (this.statusSubjects.has(statusKey)) {
        this.statusSubjects.get(statusKey)?.next({
          state: 'working',
          message,
          modified: new Date(message.timestamp),
        });
      }
    }

    // Streaming/interactive updates are transient renderer deltas. Completed
    // immutable messages are persisted only by appendLocalEvent.
    if (agentId) {
      void this.publishConversationMessage(message, true)
        .catch((error: unknown) => logger.warn('Failed to publish transient conversation projection', { agentId, messageId, error }));
    }
  }

  public concatPromptPreview(input: {
    sessionId: string;
    expectedRevision: string;
    agentFrameworkConfig: AgentFrameworkConfig;
  }): Observable<PromptConcatStreamState> {
    return new Observable<PromptConcatStreamState>(observer => {
      const abortController = new AbortController();
      const processStream = async () => {
        try {
          const generator = this.getMemeLoopRuntime().concatPromptPreview({
            ...input,
            signal: abortController.signal,
          });
          for await (const state of generator) {
            if (abortController.signal.aborted || observer.closed) return;
            assertPromptPreviewGeneratedResult({
              flatPrompts: state.flatPrompts,
              processedPrompts: state.processedPrompts,
            });
            observer.next(state);
            if (state.isComplete) {
              observer.complete();
              return;
            }
          }
        } catch (error) {
          if (!abortController.signal.aborted && !observer.closed) observer.error(error);
        }
      };
      void processStream();
      return () => {
        abortController.abort(new DOMException('Prompt preview closed', 'AbortError'));
      };
    });
  }

  public async dispose(): Promise<void> {
    await this.memeLoopRuntime?.dispose();
    this.memeLoopRuntime = null;
    for (const subject of this.agentInstanceSubjects.values()) subject.complete();
    for (const subject of this.statusSubjects.values()) subject.complete();
    for (const subject of this.conversationSubjects.values()) subject.complete();
    this.agentInstanceSubjects.clear();
    this.statusSubjects.clear();
    this.conversationSubjects.clear();
    this.conversationInvalidationWatermarks.clear();
    this.conversationInvalidationQueues.clear();
    this.durableErrorPersistence.clear();
    await this.attachmentUploadStore?.dispose();
    this.attachmentUploadStore = null;
  }

  public getFrameworkConfigSchema(frameworkId: string): Record<string, unknown> {
    try {
      logger.debug('AgentInstanceService.getFrameworkConfigSchema called', { frameworkId });
      // Check if we have a schema for this framework
      const schema = this.frameworkSchemas.get(frameworkId);
      if (schema) {
        return schema;
      }
      // If no schema found, return an empty schema
      logger.warn(`No schema found for framework: ${frameworkId}`);
      return { type: 'object', properties: {} };
    } catch (error) {
      logger.error('Error in AgentInstanceService.getFrameworkConfigSchema', {
        error,
        frameworkId,
      });
      throw error;
    }
  }
}
