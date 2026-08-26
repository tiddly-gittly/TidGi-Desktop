import { inject, injectable } from 'inversify';
import path from 'node:path';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { DataSource, In, Repository } from 'typeorm';

import { USER_DATA_FOLDER } from '@/constants/appPaths';
import { MEME_LOOP_DATABASE_KEY } from '@/constants/database';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';

import type { IDatabaseService } from '@services/database/interface';
import { AgentInstanceEntity, AgentInstanceMessageEntity, RemoteScheduledTaskProjectionEntity, ScheduledTaskEntity } from '@services/database/schema/agent';
import { ConversationTimelineStateEntity } from '@services/database/schema/conversationEvent';
import type { IExternalAPIService, ModelMessage } from '@services/externalAPI/interface';
import type { IGitService } from '@services/git/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import {
  AGENT_TOOL_LOOP_ID,
  type AgentCommittedAttachment,
  type AgentConversationMessageProjection,
  type AgentConversationUpdate,
  type AgentDeviceRpcDeleteTurnRequest,
  type AgentDeviceRpcDeleteTurnResponse,
  type AgentDeviceRpcGetTurnDetailRequest,
  type AgentDeviceRpcGetTurnDetailResponse,
  type AgentDeviceRpcRetryTurnRequest,
  type AgentDeviceRpcRetryTurnResponse,
  type AgentFrameworkConfig,
  type AgentHeartbeatConfig,
  type AgentInstance,
  type AgentInstanceLatestStatus,
  type AgentPromptDescription,
  assertPromptPreviewGeneratedResult,
  type AttachmentReference,
  type ChatMessage,
  type CompactionCandidatePage,
  type ConversationEvent,
  type ConversationEventDraft,
  type ConversationEventPage,
  conversationEventToMessage,
  type ConversationListPage,
  type ConversationMessageDetailRange,
  type ConversationMessageIdentity,
  type ConversationMessagePage,
  type ConversationMessageWindowResult,
  type ConversationTimelinePage,
  extractAgentRunError,
  type GetCompactionCandidatePageOptions,
  type GetConversationEventPageOptions,
  type GetConversationListPageOptions,
  type GetConversationMessageWindowAroundOptions,
  type GetConversationTimelinePageOptions,
  type GetMessagePageOptions,
  type GetRetainedCompactionControlsOptions,
  type MemeLoopRunHandle,
  type MemeLoopRunStatus,
  type MemeLoopRuntime,
  messageToConversationEvent,
  type MessageVersionFrontier,
  type MessageVersionFrontierCursor,
  type MessageVersionFrontierPage,
  projectConversationMessageForList,
  promptConcatStream,
  type PromptConcatStreamState,
  type PromptPreviewAuditDetailChunk,
  type PromptPreviewAuditDetailRequest,
  type PromptPreviewAuditPage,
  type PromptPreviewAuditPageRequest,
  type PromptPreviewAuditReleaseRequest,
  type RetainedCompactionControlPage,
} from 'memeloop';
import type { DesktopAgentExecuteRunRequest, DesktopPreparedAgentUserMessage, ReadDesktopAgentAttachmentChunkInput } from './attachmentUploadProtocol';
import {
  type BeginDesktopAttachmentUploadInput,
  type DesktopAttachmentUploadScope,
  DesktopAttachmentUploadStore,
  type WriteDesktopAttachmentChunkInput,
} from './attachmentUploadStore';
import type { DesktopPromptPreviewPreparedExecution, DesktopPromptPreviewPrepareInput } from './promptPreview';
import { DesktopAgentRunStateStore } from './runtime/agentRunStateStore';
import { includeConversationHistoryInPreview } from './runtime/promptPreviewMessages';

import * as repo from './agentRepository';
import type { AgentBackgroundTask, ExecuteLocalAgentMessageOptions, IAgentInstanceService, SetBackgroundAlarmInput, SetBackgroundHeartbeatInput } from './interface';
import { MemeLoopDesktopRuntime } from './runtime/runtime';
import { createMemeLoopUserMessage } from './runtime/userMessage';
import { cancelAlarm, scheduleAlarmTimer } from './tools/alarmClock';
import { cleanupMCPClient } from './tools/modelContextProtocol';
import {
  deleteRemoteScheduledTaskProjection as deleteRemoteProjection,
  getRemoteScheduledTaskProjectionPage,
  replaceRemoteScheduledTaskProjections as replaceRemoteProjections,
  upsertRemoteScheduledTaskProjection as upsertRemoteProjection,
} from './tools/remoteScheduledTaskProjectionStore';
import { getActiveHeartbeatEntries, startHeartbeat, stopHeartbeat } from './tools/scheduledTaskManager';
import {
  addTask as stmAddTask,
  cancelTasksForAgent,
  getActiveTasks as stmGetActiveTasks,
  getActiveTasksForAgent as stmGetActiveTasksForAgent,
  getCronPreviewDates as stmGetCronPreviewDates,
  getScheduledTasksPageForAgent as stmGetScheduledTasksPageForAgent,
  getTaskByScope as stmGetTaskByScope,
  initScheduledTaskManager,
  removeTask as stmRemoveTask,
  removeTaskScoped as stmRemoveTaskScoped,
  restoreScheduledTasks,
  updateTask as stmUpdateTask,
  updateTaskScoped as stmUpdateTaskScoped,
} from './tools/scheduledTaskManager';
import type {
  CreateScheduledTaskInput,
  ListRemoteScheduledTaskProjectionPageInput,
  ListScheduledTasksOptions,
  ListScheduledTasksPageForAgentInput,
  RemoteScheduledTaskProjectionPage,
  ScheduledTask,
  ScheduledTaskCallOptions,
  ScheduledTaskPage,
  ScheduledTaskScope,
  UpdateScheduledTaskInput,
} from './tools/scheduledTaskTypes';

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
  private remoteScheduledTaskProjectionRepository: Repository<RemoteScheduledTaskProjectionEntity> | null = null;
  private scheduledTaskRepositoryReady = false;
  private attachmentUploadStore: DesktopAttachmentUploadStore | null = null;

  private agentInstanceSubjects: Map<string, BehaviorSubject<AgentInstance | undefined>> = new Map();
  private statusSubjects: Map<string, BehaviorSubject<AgentInstanceLatestStatus | undefined>> = new Map();
  private conversationSubjects = new Map<string, Subject<AgentConversationUpdate>>();
  private conversationInvalidationWatermarks = new Map<string, { revision: string; totalMessages: number }>();
  private conversationInvalidationQueues = new Map<string, Promise<void>>();

  private frameworkSchemas: Map<string, Record<string, unknown>> = new Map();
  private memeLoopRuntime: MemeLoopDesktopRuntime | null = null;
  private cancelTokenMap: Map<string, { value: boolean }> = new Map();
  private activeDurableRunIds = new Map<string, Set<string>>();
  private durableErrorPersistence = new Map<string, Promise<void>>();

  public async initialize(): Promise<void> {
    try {
      await this.initializeDatabase();
      await this.initializeFrameworks();
      // Restore legacy heartbeat timers and alarms for active agents after DB + frameworks are ready
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
      this.remoteScheduledTaskProjectionRepository = this.dataSource.getRepository(RemoteScheduledTaskProjectionEntity);
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
          startHeartbeat(instance.id, heartbeatConfig, this, { createdBy: 'agent-definition' });
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
    if (!this.agentInstanceRepository || !this.agentMessageRepository || !this.remoteScheduledTaskProjectionRepository) {
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
    input: DesktopPromptPreviewPrepareInput,
  ): Promise<DesktopPromptPreviewPreparedExecution> {
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
        notifyAgentChanged: (agentId, agent) => {
          this.notifyAgentUpdate(agentId, agent);
        },
        notifyTransientMessage: (message) => this.publishConversationMessage(message, true),
        isCancelled: (agentId) => this.cancelTokenMap.get(agentId)?.value ?? false,
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

  public async createAgent(agentDefinitionID?: string, options?: { id?: string; preview?: boolean; volatile?: boolean }): Promise<AgentInstance> {
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

  public async getAgent(agentId: string): Promise<AgentInstance | undefined> {
    this.ensureRepositories();
    try {
      const agent = await this.getAgentMetadata(agentId);
      return agent ? { ...agent, messages: [] } : undefined;
    } catch (error) {
      logger.error('Failed to get agent instance', { error });
      throw error;
    }
  }

  public async getAgentMetadata(agentId: string): Promise<AgentInstance | undefined> {
    this.ensureRepositories();
    return repo.getAgentMetadata(this.agentInstanceRepository!, agentId);
  }

  public async getAgentMessagePage(agentId: string, options: GetMessagePageOptions): Promise<ConversationMessagePage> {
    this.ensureRepositories();
    return repo.getMessagePage(this.agentMessageRepository!, agentId, options);
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

  public async getAgentMessageWindowAround(
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
    const requestPeerId = (await this.deviceNetworkService.getLocalIdentity()).peerId;
    const result = await (await this.getDurableAgentRuntime()).retryTurn({ ...request, requestPeerId });
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

  public async deleteAgentTurn(agentId: string, userMessageId: string): Promise<{ messageIds: string[]; userMessage: ChatMessage } | undefined> {
    this.ensureRepositories();
    const turn = await repo.deleteConversationTurn(this.agentMessageRepository!, agentId, userMessageId);
    if (!turn) return undefined;
    const originNodeId = (await this.deviceNetworkService.getLocalIdentity()).peerId;
    await this.appendLocalConversationEvent({
      kind: 'tombstone',
      eventId: `tombstone:${crypto.randomUUID()}`,
      conversationId: agentId,
      originNodeId,
      timestamp: Date.now(),
      targetTurnId: turn.userMessage.turnId,
      reason: 'user-delete',
    });
    return turn;
  }

  public async updateAgent(agentId: string, data: Partial<AgentInstance>): Promise<AgentInstance> {
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
      cancelAlarm(agentId);
      await cancelTasksForAgent(agentId);
      await cleanupMCPClient(agentId);
      await repo.deleteAgent(this.agentInstanceRepository!, this.agentMessageRepository!, agentId);
      this.cleanupAgentSubscriptions(agentId);
    } catch (error) {
      logger.error('Failed to delete agent instance', { error });
      throw error;
    }
  }

  public async getAgents(
    page: number,
    pageSize: number,
    options?: { closed?: boolean; searchName?: string },
  ): Promise<Omit<AgentInstance, 'messages'>[]> {
    this.ensureRepositories();
    try {
      return await repo.getAgents(this.agentInstanceRepository!, page, pageSize, options);
    } catch (error) {
      logger.error('Failed to get agent instances', { error });
      throw error;
    }
  }

  public async sendMsgToAgent(
    agentId: string,
    content: { text: string; attachment?: AgentCommittedAttachment; wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }> },
  ): Promise<void> {
    try {
      await this.executeLocalAgentMessage(agentId, content, { source: 'agent-browser' });
    } catch (error) {
      // Keep the old main-process-only helper's fire-and-project contract for
      // the few compatibility tests that still call it. New callers use
      // executeLocalAgentMessage and receive the terminal failure directly.
      if (extractAgentRunError(error) || (error instanceof Error && error.message === 'agent_run_cancelled')) return;
      throw error;
    }
  }

  public async executeLocalAgentMessage(
    agentId: string,
    content: { text: string; attachment?: AgentCommittedAttachment; wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }> },
    options: ExecuteLocalAgentMessageOptions,
  ): Promise<MemeLoopRunStatus> {
    const agent = await this.getAgentMetadata(agentId);
    if (!agent) throw new Error(`Agent instance not found: ${agentId}`);
    const definition = await this.agentDefinitionService.getAgentDef(agent.agentDefId);
    if (!definition) throw new Error(`Agent definition not found: ${agent.agentDefId}`);
    if (content.attachment) await this.assertAgentAttachmentAuthorized(agentId, content.attachment.reference, false);

    const requestPeerId = (await this.deviceNetworkService.getLocalIdentity()).peerId;
    const requestId = options.requestId ?? `${options.source}:request:${crypto.randomUUID()}`;
    const turnId = options.turnId ?? `${options.source}:turn:${crypto.randomUUID()}`;
    const existingUserRoot = await this.getAgentMessage(turnId).catch(() => undefined);
    const prepared = existingUserRoot?.conversationId === agentId && existingUserRoot.role === 'user'
      ? this.preparedMessageFromPersistedUserRoot(existingUserRoot)
      : await this.createPreparedAgentUserMessage(
        {
          conversationId: agentId,
          definitionId: agent.agentDefId,
          message: content.text,
          requestId,
          turnId,
          ...(content.attachment === undefined ? {} : { attachment: content.attachment }),
          ...(content.wikiTiddlers === undefined ? {} : { wikiTiddlers: content.wikiTiddlers }),
        },
        requestPeerId,
        await this.captureBeforeTurnCommitMap(agentId),
        {
          desktopExecution: {
            source: options.source,
            requestId,
            turnId,
            ...(options.provenance ?? {}),
          },
        },
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
        conversationId: agentId,
        definitionId: agent.agentDefId,
        message: prepared.message,
        requestId,
        turnId,
        requestPeerId,
        userMessage: {
          ...prepared.userMessage,
          messageId: turnId,
          turnId,
          originNodeId: requestPeerId,
        },
      });
      this.trackDurableRun(agentId, handle.runId);
      if (content.attachment) this.getAttachmentUploadStore().consumeCommittedScope(agentId, content.attachment.reference);
      const terminal = await this.waitForDurableRun(handle.runId, options.signal, options.timeoutMs);
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
      if ((options.restartHeartbeat ?? options.source !== 'heartbeat') && definition.heartbeat?.enabled && !agent.volatile) {
        startHeartbeat(agentId, definition.heartbeat, this, { createdBy: 'agent-definition' });
      }
      return terminal;
    } catch (error) {
      if (!terminalStatusPersisted) await this.updateAgentStatusBestEffort(agentId, { state: 'failed', modified: new Date() });
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

  private async waitForDurableRun(runId: string, signal?: AbortSignal, timeoutMs?: number): Promise<MemeLoopRunStatus> {
    const runtime = await this.getDurableAgentRuntime();
    const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
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
        if (deadline !== undefined && Date.now() >= deadline) {
          cancel();
          throw new Error('durable_agent_run_timeout');
        }
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

  private preparedMessageFromPersistedUserRoot(message: ChatMessage): DesktopPreparedAgentUserMessage {
    return {
      message: message.content,
      userMessage: {
        content: message.content,
        ...(message.parts === undefined ? {} : { parts: message.parts }),
        ...(message.toolCalls === undefined ? {} : { toolCalls: message.toolCalls }),
        ...(message.attachments === undefined ? {} : { attachments: message.attachments }),
        ...(message.detailRef === undefined ? {} : { detailRef: message.detailRef }),
        ...(message.reasoning_content === undefined ? {} : { reasoning_content: message.reasoning_content }),
        ...(message.contentType === undefined ? {} : { contentType: message.contentType }),
        ...(message.hidden === undefined ? {} : { hidden: message.hidden }),
        ...(message.duration === undefined ? {} : { duration: message.duration }),
        ...(message.metadata === undefined ? {} : { metadata: message.metadata }),
      },
    };
  }

  private createDurableRunFailure(status: MemeLoopRunStatus): Error {
    const error = new Error(status.error?.code ?? 'agent_run_failed');
    if (status.error) Object.defineProperty(error, 'agentRunError', { value: status.error, enumerable: false });
    return error;
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

  public async executeAgentRun(request: DesktopAgentExecuteRunRequest): Promise<MemeLoopRunHandle> {
    const agent = await this.getAgentMetadata(request.conversationId);
    if (!agent || agent.agentDefId !== request.definitionId) {
      throw new Error('agent conversation definition mismatch');
    }
    const requestPeerId = (await this.deviceNetworkService.getLocalIdentity()).peerId;
    if (request.attachment) {
      await this.assertAgentAttachmentAuthorized(request.conversationId, request.attachment.reference, false);
    }
    const prepared = await this.createPreparedAgentUserMessage(request, requestPeerId);
    const handle = await (await this.getDurableAgentRuntime()).sendMessage({
      conversationId: request.conversationId,
      definitionId: request.definitionId,
      message: prepared.message,
      requestId: request.requestId,
      turnId: request.turnId,
      requestPeerId,
      userMessage: {
        ...prepared.userMessage,
        messageId: request.turnId,
        turnId: request.turnId,
        originNodeId: requestPeerId,
      },
    });
    if (request.attachment) {
      this.getAttachmentUploadStore().consumeCommittedScope(request.conversationId, request.attachment.reference);
    }
    return handle;
  }

  public async prepareRemoteAgentUserMessage(request: DesktopAgentExecuteRunRequest): Promise<DesktopPreparedAgentUserMessage> {
    const agent = await this.getAgentMetadata(request.conversationId);
    if (!agent || agent.agentDefId !== request.definitionId) {
      throw new Error('agent conversation definition mismatch');
    }
    if (request.attachment) {
      await this.assertAgentAttachmentAuthorized(request.conversationId, request.attachment.reference, false);
    }
    const localPeerId = (await this.deviceNetworkService.getLocalIdentity()).peerId;
    return this.createPreparedAgentUserMessage(request, localPeerId);
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

  private async createPreparedAgentUserMessage(
    request: DesktopAgentExecuteRunRequest,
    localPeerId: string,
    beforeCommitMap?: Record<string, { wikiFolderLocation: string; commitHash: string }>,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<DesktopPreparedAgentUserMessage> {
    const userMessage = await createMemeLoopUserMessage({
      agentId: request.conversationId,
      content: {
        text: request.message,
        attachment: request.attachment,
        wikiTiddlers: request.wikiTiddlers ? [...request.wikiTiddlers] : undefined,
      },
      originNodeId: localPeerId,
      messageId: request.turnId,
      beforeCommitMap,
      metadata,
    });
    const {
      messageId: _messageId,
      originNodeId: _originNodeId,
      timestamp: _timestamp,
      turnId: _turnId,
      ...pending
    } = userMessage;
    return {
      message: userMessage.content ?? request.message,
      userMessage: pending,
    };
  }

  public async cancelAgent(agentId: string): Promise<void> {
    // Stop heartbeat on cancel
    stopHeartbeat(agentId);

    // Cancel any pending ask-question promises so the agent loop can exit
    try {
      const { cancelPendingQuestions } = await import('./tools/askQuestionPending');
      cancelPendingQuestions(agentId);
    } catch {
      // ignore if module not loaded
    }

    const durableRunIds = [...(this.activeDurableRunIds.get(agentId) ?? [])];
    await (await this.getDurableAgentRuntime()).cancelAgent(agentId);

    // Keep the compatibility token until the last legacy in-process caller is removed.
    const cancelToken = this.cancelTokenMap.get(agentId);

    if (cancelToken || durableRunIds.length > 0) {
      // Set cancel flag
      if (cancelToken) cancelToken.value = true;

      try {
        // Update agent status to canceled
        logger.debug(`cancelAgent called for ${agentId} - updating agent status to canceled`);
        await this.updateAgent(agentId, {
          status: {
            state: 'canceled',
            modified: new Date(),
          },
        });
        logger.debug(`updateAgent returned for cancelAgent ${agentId}`);

        // Propagate canceled status to any message-specific subscriptions so UI can react
        try {
          logger.debug('propagating canceled status to message-specific subscriptions', { function: 'cancelAgent', agentId });
          for (const key of Array.from(this.statusSubjects.keys())) {
            if (key.startsWith(`${agentId}:`)) {
              const messageId = key.slice(agentId.length + 1);
              const subject = this.statusSubjects.get(key);
              const message = await this.getAgentMessage(messageId);
              if (subject) {
                try {
                  logger.debug('propagate canceled to subscription', { function: 'cancelAgent', subscriptionKey: key });
                  subject.next({
                    state: 'canceled',
                    message: message || ({} as ChatMessage),
                    modified: new Date(),
                  });
                } catch {
                  // ignore
                }
                try {
                  subject.complete();
                } catch {
                  // ignore
                }
                this.statusSubjects.delete(key);
              }
            }
          }
        } catch (error) {
          logger.warn('Failed to propagate cancel status to message subscriptions', { function: 'cancelAgent', error });
        }

        // Remove cancel token from map
        this.cancelTokenMap.delete(agentId);

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
      cancelAlarm(agentId);
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

      // Cancel any ongoing operations
      if (this.cancelTokenMap.has(agentId)) {
        const token = this.cancelTokenMap.get(agentId);
        if (token) {
          token.value = true;
        }
        this.cancelTokenMap.delete(agentId);
      }

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

  public async resolveToolApproval(approvalId: string, decision: 'allow' | 'deny'): Promise<void> {
    const { resolveApproval } = await import('./tools/approval');
    resolveApproval(approvalId, decision);
  }

  public resolveAskQuestion(agentId: string, questionId: string, answer: string): void {
    // Resolve ask-question by injecting the answer as a tool result and resuming the agent loop.
    // This keeps the answer in the same turn (no new user message).
    void this.resolveAskQuestionAsync(agentId, questionId, answer);
  }

  private async resolveAskQuestionAsync(agentId: string, questionId: string, answer: string): Promise<void> {
    try {
      await this.executeLocalAgentMessage(agentId, { text: answer }, {
        source: 'ask-question',
        requestId: `ask-question:${questionId}:request`,
        turnId: `ask-question:${questionId}:turn`,
        provenance: { questionId },
      });
      logger.debug('Ask-question resolved via durable local run', { questionId, agentId });
    } catch (error) {
      logger.error('Failed to resolve ask-question', { questionId, error });
    }
  }

  public async deleteMessages(agentId: string, messageIds: string[]): Promise<void> {
    if (!this.agentMessageRepository || !this.agentInstanceRepository) {
      throw new Error('Database not initialized');
    }
    if (messageIds.length === 0) return;

    const messages = await this.agentMessageRepository.findBy({ messageId: In(messageIds), conversationId: agentId });
    const originNodeId = (await this.deviceNetworkService.getLocalIdentity()).peerId;
    for (const turnId of new Set(messages.map(message => message.turnId))) {
      await this.appendLocalConversationEvent({
        kind: 'tombstone',
        eventId: `tombstone:${crypto.randomUUID()}`,
        conversationId: agentId,
        originNodeId,
        timestamp: Date.now(),
        targetTurnId: turnId,
        reason: 'user-delete',
      });
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

  public async getBackgroundTasks(): Promise<AgentBackgroundTask[]> {
    const tasks: AgentBackgroundTask[] = [];

    // Collect heartbeats from in-memory registry
    const heartbeatEntries = getActiveHeartbeatEntries();
    for (const heartbeatEntry of heartbeatEntries) {
      const agentId = heartbeatEntry.agentId;
      const agent = await this.getAgentMetadata(agentId);
      const agentDefinition = agent?.agentDefId ? await this.agentDefinitionService.getAgentDef(agent.agentDefId) : undefined;
      const heartbeatConfig = agentDefinition?.heartbeat;
      tasks.push({
        agentId,
        agentName: agent?.name ?? agentDefinition?.name,
        type: 'heartbeat',
        intervalSeconds: heartbeatConfig?.intervalSeconds,
        activeHoursStart: heartbeatConfig?.activeHoursStart,
        activeHoursEnd: heartbeatConfig?.activeHoursEnd,
        nextWakeAtISO: heartbeatEntry.nextWakeAtISO,
        message: heartbeatConfig?.message,
        createdBy: heartbeatEntry.createdBy,
        lastRunAtISO: heartbeatEntry.lastRunAtISO,
        runCount: heartbeatEntry.runCount,
      });
    }

    // Collect alarms from unified ScheduledTaskManager
    for (const task of (await stmGetActiveTasks()).filter(t => t.scheduleKind === 'at')) {
      const agent = await this.getAgentMetadata(task.agentInstanceId);
      const atSchedule = task.schedule as Extract<typeof task.schedule, { kind: 'at' }>;
      tasks.push({
        agentId: task.agentInstanceId,
        agentName: agent?.name,
        type: 'alarm',
        wakeAtISO: atSchedule.wakeAtISO,
        nextWakeAtISO: task.nextRunAt,
        message: task.payload?.message,
        createdBy: task.createdBy,
        lastRunAtISO: task.lastRunAt,
        runCount: task.runCount,
      });
    }

    return tasks;
  }

  public async cancelBackgroundTask(agentId: string, type: 'heartbeat' | 'alarm'): Promise<void> {
    if (type === 'heartbeat') {
      stopHeartbeat(agentId);
    } else if (type === 'alarm') {
      cancelAlarm(agentId);
    }
    logger.info('Background task cancelled from UI', { agentId, type });
  }

  public async setBackgroundAlarm(agentId: string, alarm: SetBackgroundAlarmInput): Promise<void> {
    this.ensureRepositories();

    const entity = await this.agentInstanceRepository!.findOne({ where: { id: agentId } });
    if (!entity) {
      throw new Error(`Agent instance not found: ${agentId}`);
    }

    const parsedWakeAt = new Date(alarm.wakeAtISO);
    if (Number.isNaN(parsedWakeAt.getTime())) {
      throw new Error(`Invalid wakeAtISO: ${alarm.wakeAtISO}`);
    }

    const wakeAtISO = parsedWakeAt.toISOString();

    await scheduleAlarmTimer(agentId, wakeAtISO, alarm.message, {
      createdBy: 'settings-ui',
      runCount: 0,
    });

    logger.info('Background alarm upserted from UI', {
      agentId,
      wakeAtISO,
    });
  }

  public async setBackgroundHeartbeat(agentId: string, heartbeat: SetBackgroundHeartbeatInput): Promise<void> {
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

    const normalizedHeartbeat: AgentHeartbeatConfig = {
      enabled: heartbeat.enabled,
      intervalSeconds: Math.max(60, Math.round(heartbeat.intervalSeconds || 60)),
      message: heartbeat.message?.trim() || '[Heartbeat] Periodic check-in. Review your tasks and take any pending actions.',
      activeHoursStart: heartbeat.activeHoursStart || undefined,
      activeHoursEnd: heartbeat.activeHoursEnd || undefined,
    };

    await this.agentDefinitionService.updateAgentDef({
      id: agentDefinition.id,
      heartbeat: normalizedHeartbeat,
    });

    if (normalizedHeartbeat.enabled && !entity.volatile) {
      startHeartbeat(agentId, normalizedHeartbeat, this, { createdBy: 'settings-ui' });
    } else {
      stopHeartbeat(agentId);
    }

    logger.info('Background heartbeat upserted from UI', {
      agentId,
      enabled: normalizedHeartbeat.enabled,
      intervalSeconds: normalizedHeartbeat.intervalSeconds,
      activeHoursStart: normalizedHeartbeat.activeHoursStart,
      activeHoursEnd: normalizedHeartbeat.activeHoursEnd,
    });
  }

  // ── ScheduledTask CRUD ────────────────────────────────────────────────────

  public async createScheduledTask(input: CreateScheduledTaskInput, options?: ScheduledTaskCallOptions): Promise<ScheduledTask> {
    return stmAddTask(input, options);
  }

  public async updateScheduledTask(input: UpdateScheduledTaskInput): Promise<ScheduledTask> {
    return stmUpdateTask(input);
  }

  public async updateScheduledTaskScoped(
    scope: ScheduledTaskScope,
    input: UpdateScheduledTaskInput,
    options?: ScheduledTaskCallOptions,
  ): Promise<ScheduledTask> {
    return stmUpdateTaskScoped(scope, input, options);
  }

  public async deleteScheduledTask(taskId: string): Promise<void> {
    return stmRemoveTask(taskId);
  }

  public async deleteScheduledTaskScoped(scope: ScheduledTaskScope, options?: ScheduledTaskCallOptions): Promise<void> {
    return stmRemoveTaskScoped(scope, options);
  }

  public async getScheduledTaskByScope(scope: ScheduledTaskScope, options?: ScheduledTaskCallOptions): Promise<ScheduledTask | undefined> {
    return stmGetTaskByScope(scope, options);
  }

  public async listScheduledTasks(options?: ListScheduledTasksOptions): Promise<ScheduledTask[]> {
    return stmGetActiveTasks(options);
  }

  public async listScheduledTasksForAgent(agentInstanceId: string, options?: ListScheduledTasksOptions): Promise<ScheduledTask[]> {
    return stmGetActiveTasksForAgent(agentInstanceId, options);
  }

  public async listScheduledTasksPageForAgent(input: ListScheduledTasksPageForAgentInput): Promise<ScheduledTaskPage> {
    return stmGetScheduledTasksPageForAgent(input);
  }

  public async listRemoteScheduledTaskProjectionPageForAgent(
    input: ListRemoteScheduledTaskProjectionPageInput,
  ): Promise<RemoteScheduledTaskProjectionPage> {
    this.ensureRepositories();
    return getRemoteScheduledTaskProjectionPage(this.remoteScheduledTaskProjectionRepository!, input);
  }

  public async replaceRemoteScheduledTaskProjections(
    agentInstanceId: string,
    executionNodeId: string,
    tasks: ScheduledTask[],
    observedAt: number,
  ): Promise<void> {
    this.ensureRepositories();
    await replaceRemoteProjections(
      this.remoteScheduledTaskProjectionRepository!,
      agentInstanceId,
      executionNodeId,
      tasks,
      observedAt,
    );
  }

  public async upsertRemoteScheduledTaskProjection(task: ScheduledTask, observedAt: number): Promise<void> {
    this.ensureRepositories();
    await upsertRemoteProjection(this.remoteScheduledTaskProjectionRepository!, task, observedAt);
  }

  public async deleteRemoteScheduledTaskProjection(taskId: string, executionNodeId: string): Promise<void> {
    this.ensureRepositories();
    await deleteRemoteProjection(this.remoteScheduledTaskProjectionRepository!, taskId, executionNodeId);
  }

  public async getCronPreviewDates(expression: string, timezone?: string, count = 3): Promise<string[]> {
    return stmGetCronPreviewDates(expression, timezone, count);
  }

  public subscribeToAgentUpdates(agentId: string): Observable<AgentInstance | undefined>;
  /**
   * Subscribe to agent instance message status updates
   */
  public subscribeToAgentUpdates(agentId: string, messageId: string): Observable<AgentInstanceLatestStatus | undefined>;
  public subscribeToAgentUpdates(agentId: string, messageId?: string): Observable<AgentInstance | AgentInstanceLatestStatus | undefined> {
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
      this.agentInstanceSubjects.set(agentId, new BehaviorSubject<AgentInstance | undefined>(undefined));

      // Try to get initial data
      this.getAgentMetadata(agentId).then(agent => {
        this.agentInstanceSubjects.get(agentId)?.next(agent ? { ...agent, messages: [] } : undefined);
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

  private toConversationProjection(message: ChatMessage): AgentConversationMessageProjection {
    return projectConversationMessageForList(message, 256 * 1024);
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
    const projection = this.toConversationProjection(message);
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
  private notifyAgentUpdate(agentId: string, agentData: AgentInstance): void {
    try {
      // Only notify if there are active subscriptions
      if (this.agentInstanceSubjects.has(agentId)) {
        // Metadata subscriptions never carry transcript content. Conversation
        // projections use subscribeToConversationUpdates with revision fences.
        this.agentInstanceSubjects.get(agentId)?.next({
          ...agentData,
          messages: [],
        });
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

  public concatPrompt(promptDescription: Pick<AgentPromptDescription, 'agentFrameworkConfig'>, messages: ChatMessage[]): Observable<PromptConcatStreamState> {
    logger.debug('AgentInstanceService.concatPrompt called', {
      hasPromptConfig: !!promptDescription.agentFrameworkConfig,
      promptConfigKeys: Object.keys(promptDescription.agentFrameworkConfig ?? {}),
      messagesCount: messages.length,
    });

    return new Observable<PromptConcatStreamState>((observer) => {
      const processStream = async () => {
        try {
          const emptyConfig: AgentFrameworkConfig = { prompts: [], plugins: [] };
          // Include Desktop tool registry so that concatPrompt can find defineTool plugins
          const frameworkContext = {
            agent: {
              id: 'temp',
              messages,
              agentDefId: 'temp',
              status: { state: 'working' as const, modified: new Date() },
              created: new Date(),
              agentFrameworkConfig: emptyConfig,
            },
            agentDef: { id: 'temp', name: 'temp', agentFrameworkConfig: promptDescription.agentFrameworkConfig ?? emptyConfig },
            tools: { getPromptPlugins: () => this.getMemeLoopRuntime().getPromptPlugins() },
            isCancelled: () => false,
          };

          const streamGenerator = promptConcatStream(promptDescription, messages, frameworkContext as never);
          for await (const state of streamGenerator) {
            observer.next({
              ...state,
              flatPrompts: includeConversationHistoryInPreview(state.flatPrompts as ModelMessage[], messages),
            });
            if (state.isComplete) {
              observer.complete();
              break;
            }
          }
        } catch (error) {
          logger.error('Error in AgentInstanceService.concatPrompt', {
            error,
            messagesCount: messages.length,
          });
          observer.error(error);
        }
      };
      void processStream();
    });
  }

  public concatPromptPreview(input: {
    sessionId: string;
    expectedRevision: string;
    agentFrameworkConfig: AgentFrameworkConfig;
  }): Observable<PromptConcatStreamState> {
    return new Observable<PromptConcatStreamState>(observer => {
      let cancelled = false;
      const processStream = async () => {
        try {
          const messages = this.getMemeLoopRuntime().getPromptPreviewMessagesForHost(
            input.sessionId,
            input.expectedRevision,
          );
          const emptyConfig: AgentFrameworkConfig = { prompts: [], plugins: [] };
          const frameworkContext = {
            agent: {
              id: 'prompt-preview',
              messages,
              agentDefId: 'prompt-preview',
              status: { state: 'working' as const, modified: new Date() },
              created: new Date(),
              agentFrameworkConfig: emptyConfig,
            },
            agentDef: {
              id: 'prompt-preview',
              name: 'prompt-preview',
              agentFrameworkConfig: input.agentFrameworkConfig,
            },
            tools: { getPromptPlugins: () => this.getMemeLoopRuntime().getPromptPlugins() },
            isCancelled: () => cancelled,
          };
          const generator = promptConcatStream(
            { agentFrameworkConfig: input.agentFrameworkConfig },
            [...messages],
            frameworkContext as never,
          );
          for await (const state of generator) {
            if (cancelled || observer.closed) return;
            const flatPrompts = state.flatPrompts.at(-1)?.role === 'user'
              ? state.flatPrompts.slice(0, -1)
              : state.flatPrompts;
            assertPromptPreviewGeneratedResult({ flatPrompts, processedPrompts: state.processedPrompts });
            observer.next({ ...state, flatPrompts });
            if (state.isComplete) {
              observer.complete();
              return;
            }
          }
        } catch (error) {
          if (!cancelled && !observer.closed) observer.error(error);
        }
      };
      void processStream();
      return () => {
        cancelled = true;
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
