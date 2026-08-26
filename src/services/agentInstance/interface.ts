import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type {
  AgentCommittedAttachment,
  AgentConversationUpdate,
  AgentDeviceRpcDeleteTurnRequest,
  AgentDeviceRpcDeleteTurnResponse,
  AgentDeviceRpcGetTurnDetailRequest,
  AgentDeviceRpcGetTurnDetailResponse,
  AgentDeviceRpcRetryTurnRequest,
  AgentDeviceRpcRetryTurnResponse,
  AgentFrameworkConfig,
  AgentInstance,
  AgentInstanceLatestStatus,
  AgentPromptDescription,
  AttachmentReference,
  ChatMessage,
  CompactionCandidatePage,
  ConversationEvent,
  ConversationEventDraft,
  ConversationEventPage,
  ConversationListPage,
  ConversationMessageDetailRange,
  ConversationMessageIdentity,
  ConversationMessagePage,
  ConversationMessageWindowResult,
  ConversationTimelinePage,
  GetCompactionCandidatePageOptions,
  GetConversationEventPageOptions,
  GetConversationListPageOptions,
  GetConversationMessageWindowAroundOptions,
  GetConversationTimelinePageOptions,
  GetMessagePageOptions,
  GetRetainedCompactionControlsOptions,
  MemeLoopRunHandle,
  MemeLoopRunStatus,
  MemeLoopRuntime,
  MessageVersionFrontier,
  MessageVersionFrontierCursor,
  MessageVersionFrontierPage,
  PromptConcatStreamState,
  PromptPreviewAuditDetailChunk,
  PromptPreviewAuditDetailRequest,
  PromptPreviewAuditPage,
  PromptPreviewAuditPageRequest,
  PromptPreviewAuditReleaseRequest,
  RetainedCompactionControlPage,
} from 'memeloop';
import type { Observable } from 'rxjs';

import { AgentChannel } from '@/constants/channels';
import type { ConversationListProjectionScope } from './agentRepository';
import type {
  BeginDesktopAttachmentUploadInput,
  DesktopAgentExecuteRunRequest,
  DesktopAttachmentUploadScope,
  DesktopPreparedAgentUserMessage,
  ReadDesktopAgentAttachmentChunkInput,
  WriteDesktopAttachmentChunkInput,
} from './attachmentUploadProtocol';
import type { DesktopPromptPreviewPreparedExecution, DesktopPromptPreviewPrepareInput } from './promptPreview';
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

export interface AgentBackgroundTask {
  agentId: string;
  agentName?: string;
  type: 'heartbeat' | 'alarm';
  intervalSeconds?: number;
  activeHoursStart?: string;
  activeHoursEnd?: string;
  wakeAtISO?: string;
  nextWakeAtISO?: string;
  message?: string;
  createdBy?: string;
  lastRunAtISO?: string;
  runCount?: number;
}

export interface SetBackgroundAlarmInput {
  wakeAtISO: string;
  message?: string;
}

export interface SetBackgroundHeartbeatInput {
  enabled: boolean;
  intervalSeconds: number;
  message?: string;
  activeHoursStart?: string;
  activeHoursEnd?: string;
}

export type LocalAgentExecutionSource = 'agent-browser' | 'ask-question' | 'heartbeat' | 'scheduled-task' | 'spawn-agent';

/** Main-process-only durable execution input used by background and host services. */
export interface ExecuteLocalAgentMessageOptions {
  /** Stable keys make a retried host operation an idempotent replay. */
  requestId?: string;
  turnId?: string;
  source: LocalAgentExecutionSource;
  /** Interactive work restarts the heartbeat countdown; a heartbeat tick does not. */
  restartHeartbeat?: boolean;
  /** Safe structured source metadata persisted on the exact user-root turn. */
  provenance?: Readonly<Record<string, string | number | boolean>>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Agent instance service to manage chat instances and messages
 */
export interface IAgentInstanceService {
  /**
   * Initialize the service on application startup
   */
  initialize(): Promise<void>;
  /**
   * For testing purposes, only initialize the built-in handlers without database
   */
  initializeFrameworks(): Promise<void>;

  /**
   * Create a new agent instance from a definition
   * @param agentDefinitionID Agent definition ID, if not provided, will use the default agent
   * @param options Additional options for creating the agent instance
   */
  createAgent(agentDefinitionID?: string, options?: { id?: string; preview?: boolean; volatile?: boolean }): Promise<AgentInstance>;
  /** Main-process only; deliberately omitted from the renderer IPC descriptor. */
  getDurableAgentRuntime(): Promise<MemeLoopRuntime>;
  /** Main-process only exact-id materialization for authenticated Device RPC. */
  ensureAgentConversation(definitionId: string, conversationId?: string): Promise<{ conversationId: string }>;

  /** Legacy main-process-only compatibility wrapper; omitted from renderer IPC. */
  sendMsgToAgent(agentId: string, content: {
    text: string;
    attachment?: AgentCommittedAttachment;
    wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }>;
  }): Promise<void>;

  /**
   * Main-process-only durable local execution port. It accepts an idempotent run,
   * waits for its persisted terminal state, and is intentionally omitted from IPC.
   */
  executeLocalAgentMessage(agentId: string, content: {
    text: string;
    attachment?: AgentCommittedAttachment;
    wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }>;
  }, options: ExecuteLocalAgentMessageOptions): Promise<MemeLoopRunStatus>;

  /** Accept one exact-identity durable local run for the shared execution coordinator. */
  executeAgentRun(request: DesktopAgentExecuteRunRequest): Promise<MemeLoopRunHandle>;
  /** Read the restart-safe terminal/progress state of one durable local run. */
  getAgentRunStatus(runId: string): Promise<MemeLoopRunStatus | undefined>;
  /** Cancel one exact durable run without cancelling unrelated conversation work. */
  cancelAgentRun(runId: string): Promise<boolean>;

  beginAgentAttachmentUpload(input: BeginDesktopAttachmentUploadInput): Promise<{ uploadId: string }>;
  writeAgentAttachmentChunk(input: WriteDesktopAttachmentChunkInput): Promise<{ nextOffset: number }>;
  commitAgentAttachmentUpload(input: DesktopAttachmentUploadScope): Promise<AgentCommittedAttachment>;
  abortAgentAttachmentUpload(input: DesktopAttachmentUploadScope): Promise<void>;
  /** Prepare host-rendered wiki/attachment metadata without persisting a local turn. */
  prepareRemoteAgentUserMessage(request: DesktopAgentExecuteRunRequest): Promise<DesktopPreparedAgentUserMessage>;
  /** Read only an attachment authorized for this exact conversation. */
  readAgentAttachmentChunk(input: ReadDesktopAgentAttachmentChunkInput): Promise<Uint8Array | null>;
  preparePromptPreviewExecutionModelRequest(input: DesktopPromptPreviewPrepareInput): Promise<DesktopPromptPreviewPreparedExecution>;
  getPromptPreviewAuditPage(input: PromptPreviewAuditPageRequest): Promise<PromptPreviewAuditPage>;
  getPromptPreviewAuditDetail(input: PromptPreviewAuditDetailRequest): Promise<PromptPreviewAuditDetailChunk>;
  releasePromptPreviewAuditSession(input: PromptPreviewAuditReleaseRequest): Promise<void>;
  cancelPromptPreview(requestId: string): Promise<void>;

  /** Main-process blob-store bindings used by sync; deliberately absent from renderer IPC. */
  getAgentAttachmentReference(contentHash: string, options?: { signal?: AbortSignal }): Promise<AttachmentReference | null>;
  saveAgentAttachment(reference: AttachmentReference, data: Uint8Array, options?: { signal?: AbortSignal }): Promise<void>;
  readAgentAttachmentRange(contentHash: string, offset: number, maxBytes: number, options?: { signal?: AbortSignal }): Promise<Uint8Array | null>;

  /**
   * Subscribe to agent instance updates
   * @param agentId Agent instance ID
   */
  subscribeToAgentUpdates(agentId: string): Observable<AgentInstance | undefined>;
  /**
   * Subscribe to agent instance message status updates
   * @param agentId Agent instance ID
   * @param messageId Message ID
   */
  subscribeToAgentUpdates(agentId: string, messageId: string): Observable<AgentInstanceLatestStatus | undefined>;

  /** Revision-aware bounded conversation projection/invalidation stream. */
  subscribeToConversationUpdates(conversationId: string): Observable<AgentConversationUpdate>;

  /**
   * Get agent instance data by ID
   * @param agentId Agent instance ID
   */
  /** @deprecated Metadata-only compatibility alias; use getAgentMetadata. */
  getAgent(agentId: string): Promise<AgentInstance | undefined>;

  /** Metadata-only agent read for renderer views. */
  getAgentMetadata(agentId: string): Promise<AgentInstance | undefined>;

  /** Bounded keyset page; never returns the complete transcript accidentally. */
  getAgentMessagePage(agentId: string, options: GetMessagePageOptions): Promise<ConversationMessagePage>;
  /** Indexed identity-only read; never materializes message content. */
  getAgentMessageIdentity(
    agentId: string,
    messageId: string,
  ): Promise<ConversationMessageIdentity | null>;
  /** Bounded canonical ChatMessage byte range for detail/export streaming. */
  readAgentMessageDetailRange(
    agentId: string,
    messageId: string,
    offset: number,
    maxBytes: number,
  ): Promise<ConversationMessageDetailRange>;
  /** Single-transaction absolute seek around a turn/timeline focus. */
  getAgentMessageWindowAround(
    agentId: string,
    options: GetConversationMessageWindowAroundOptions,
  ): Promise<ConversationMessageWindowResult>;
  getAgentConversationListPage(localNodeId: string, options: GetConversationListPageOptions): Promise<ConversationListPage>;
  /** Main-process-only grant-scoped collection query used by Device RPC. */
  getAgentConversationListPageScoped(
    localNodeId: string,
    options: GetConversationListPageOptions,
    scope: ConversationListProjectionScope,
  ): Promise<ConversationListPage>;

  /** Bounded absolute-index page for long-conversation timeline navigation. */
  getAgentConversationTimelinePage(agentId: string, options: GetConversationTimelinePageOptions): Promise<ConversationTimelinePage>;
  getMaxAgentLamportClock(agentId: string): Promise<number>;
  getExistingAgentMessageIds(agentId: string, messageIds: string[]): Promise<string[]>;
  getAgentMessage(messageId: string): Promise<ChatMessage | undefined>;
  getAgentTurnDetail(request: AgentDeviceRpcGetTurnDetailRequest): Promise<AgentDeviceRpcGetTurnDetailResponse>;
  deleteConversationTurn(request: AgentDeviceRpcDeleteTurnRequest): Promise<AgentDeviceRpcDeleteTurnResponse>;
  retryConversationTurn(request: AgentDeviceRpcRetryTurnRequest): Promise<AgentDeviceRpcRetryTurnResponse>;
  /** Most recent durable compaction summary, without loading the transcript. */
  getLatestContextCompactionSummary(agentId: string): Promise<ChatMessage | undefined>;
  conversationReferencesAttachment(agentId: string, contentHash: string): Promise<boolean>;
  getAgentCompactionCandidatePage(agentId: string, options: GetCompactionCandidatePageOptions): Promise<CompactionCandidatePage>;
  getAgentRetainedCompactionControls(agentId: string, options: GetRetainedCompactionControlsOptions): Promise<RetainedCompactionControlPage>;
  appendLocalConversationEvent(draft: ConversationEventDraft): Promise<ConversationEvent>;
  appendLocalConversationEventsAtomic(drafts: readonly ConversationEventDraft[]): Promise<ConversationEvent[]>;
  insertConversationEventsIfAbsent(events: readonly ConversationEvent[]): Promise<void>;
  getConversationEventPage(agentId: string, options: GetConversationEventPageOptions): Promise<ConversationEventPage>;
  getConversationEventVersionFrontiers(agentIds?: readonly string[]): Promise<MessageVersionFrontier[]>;
  getConversationEventVersionFrontierPage(options: {
    limit: number;
    after?: MessageVersionFrontierCursor;
    conversationIds?: readonly string[];
  }): Promise<MessageVersionFrontierPage>;
  getConversationEventVersionFrontiersForKeys(keys: readonly MessageVersionFrontierCursor[]): Promise<MessageVersionFrontier[]>;
  deleteAgentTurn(agentId: string, userMessageId: string): Promise<{ messageIds: string[]; userMessage: ChatMessage } | undefined>;

  /**
   * Update agent instance data
   * @param agentId Agent instance ID
   * @param data Updated data
   */
  updateAgent(agentId: string, data: Partial<AgentInstance>): Promise<AgentInstance>;

  /**
   * Delete agent instance and all its messages
   * @param agentId Agent instance ID
   */
  deleteAgent(agentId: string): Promise<void>;

  /**
   * Cancel current operations for agent instance
   * @param agentId Agent instance ID
   */
  cancelAgent(agentId: string): Promise<void>;

  /**
   * Get all agent instances with pagination and optional filters
   * Only return light-weight instance data without messages to avoid unnecessary payload.
   * @param page Page number
   * @param pageSize Number of items per page
   * @param options Filter options
   */
  getAgents(page: number, pageSize: number, options?: { closed?: boolean; searchName?: string }): Promise<Omit<AgentInstance, 'messages'>[]>;

  /**
   * Close agent instance without deleting it
   * @param agentId Agent instance ID
   */
  closeAgent(agentId: string): Promise<void>;

  /**
   * Pure function to concatenate prompts with given prompt description and messages
   * This is useful for front-end to generate prompts from configurations.
   * Returns an Observable stream that yields intermediate processing states and final result
   * @param promptDescription Configuration for prompt generation
   * @param messages Messages to be included in prompt generation
   * @returns Observable stream of processing states, with final state containing complete results
   */
  concatPrompt(promptDescription: Pick<AgentPromptDescription, 'agentFrameworkConfig'>, messages: ChatMessage[]): Observable<PromptConcatStreamState>;
  concatPromptPreview(input: {
    sessionId: string;
    expectedRevision: string;
    agentFrameworkConfig: AgentFrameworkConfig;
  }): Observable<PromptConcatStreamState>;

  /**
   * Get JSON Schema for handler configuration
   * This allows frontend to generate a form based on the schema for a specific handler
   * @param agentFrameworkID Handler ID to get schema for
   * @returns JSON Schema for handler configuration
   */
  getFrameworkConfigSchema(frameworkId: string): Record<string, unknown>;

  /**
   * Save user message to database
   * Made public so plugins can use it for message persistence
   * @param userMessage User message to save
   */
  saveUserMessage(userMessage: ChatMessage): Promise<void>;

  /**
   * Debounced message update to reduce database writes
   * Made public so plugins can use it for UI updates
   * @param message Message to update
   * @param agentId Agent ID for status subscribers
   * @param debounceMs Debounce delay in milliseconds
   */
  debounceUpdateMessage(message: ChatMessage, agentId?: string, debounceMs?: number): void;

  /**
   * Resolve a pending tool approval request from the UI
   * @param approvalId The approval request ID
   * @param decision 'allow' or 'deny'
   */
  resolveToolApproval(approvalId: string, decision: 'allow' | 'deny'): Promise<void>;

  /**
   * Resolve a pending ask-question request from the UI.
   * The user's answer is sent as a tool result (same turn), not as a new user message.
   * @param agentId The agent instance ID
   * @param questionId The question ID embedded in the ask-question tool result
   * @param answer The user's answer text
   */
  resolveAskQuestion(agentId: string, questionId: string, answer: string): void;

  /**
   * Delete specific messages from an agent instance.
   * Used for turn deletion / retry — removes messages from DB and the agent's message list.
   * @param agentId Agent instance ID
   * @param messageIds Array of message IDs to delete
   */
  deleteMessages(agentId: string, messageIds: string[]): Promise<void>;

  /**
   * Rollback file changes made during an agent turn.
   * Uses the beforeCommitHash stored in the user message metadata to restore files
   * to their state before the agent turn started.
   * @param agentId Agent instance ID
   * @param userMessageId The user message that started the turn
   * @returns Object with rollback results
   */
  rollbackTurn(agentId: string, userMessageId: string): Promise<{ rolledBack: number; errors: string[] }>;

  /**
   * Get the list of files changed during an agent turn by comparing
   * the beforeCommitHash (stored in user message metadata) with current HEAD.
   * @param agentId Agent instance ID
   * @param userMessageId The user message that started the turn
   * @returns Array of changed files with their status
   */
  getTurnChangedFiles(agentId: string, userMessageId: string): Promise<Array<{ path: string; status: string }>>;

  /**
   * Get all active background tasks (heartbeats + alarms) for display in settings UI.
   */
  getBackgroundTasks(): Promise<AgentBackgroundTask[]>;

  /**
   * Cancel a background task by agent ID and type.
   */
  cancelBackgroundTask(agentId: string, type: 'heartbeat' | 'alarm'): Promise<void>;

  /**
   * Create or update an alarm task from settings UI.
   */
  setBackgroundAlarm(agentId: string, alarm: SetBackgroundAlarmInput): Promise<void>;

  /**
   * Create or update heartbeat configuration from settings UI.
   */
  setBackgroundHeartbeat(agentId: string, heartbeat: SetBackgroundHeartbeatInput): Promise<void>;

  // ── ScheduledTask CRUD (Phase 2) ──────────────────────────────────────────

  /**
   * Create a new scheduled task and start its timer.
   */
  createScheduledTask(input: CreateScheduledTaskInput, options?: ScheduledTaskCallOptions): Promise<ScheduledTask>;

  /**
   * Update an existing scheduled task (restarts timer with new config).
   */
  updateScheduledTask(input: UpdateScheduledTaskInput): Promise<ScheduledTask>;

  /** Main-process-only atomic full-scope mutation used by authenticated RPC. */
  updateScheduledTaskScoped(scope: ScheduledTaskScope, input: UpdateScheduledTaskInput, options?: ScheduledTaskCallOptions): Promise<ScheduledTask>;

  /**
   * Delete a scheduled task and stop its timer.
   */
  deleteScheduledTask(taskId: string): Promise<void>;

  /** Main-process-only atomic full-scope soft delete used by authenticated RPC. */
  deleteScheduledTaskScoped(scope: ScheduledTaskScope, options?: ScheduledTaskCallOptions): Promise<void>;

  /** Main-process-only full-scope lookup used by authenticated RPC. */
  getScheduledTaskByScope(scope: ScheduledTaskScope, options?: ScheduledTaskCallOptions): Promise<ScheduledTask | undefined>;

  /**
   * List all active scheduled tasks (from in-memory registry).
   */
  listScheduledTasks(options?: ListScheduledTasksOptions): Promise<ScheduledTask[]>;

  /**
   * List active scheduled tasks for a specific agent instance.
   * Used by TabItem to show the clock indicator.
   */
  listScheduledTasksForAgent(agentInstanceId: string, options?: ListScheduledTasksOptions): Promise<ScheduledTask[]>;

  /** Main-process-only bounded keyset page used by the authenticated RPC handler. */
  listScheduledTasksPageForAgent(input: ListScheduledTasksPageForAgentInput): Promise<ScheduledTaskPage>;

  /** Bounded durable snapshots of schedules owned by remote devices. */
  listRemoteScheduledTaskProjectionPageForAgent(input: ListRemoteScheduledTaskProjectionPageInput): Promise<RemoteScheduledTaskProjectionPage>;

  /** Replace one remote device's observed schedule set after a successful RPC. */
  replaceRemoteScheduledTaskProjections(agentInstanceId: string, executionNodeId: string, tasks: ScheduledTask[], observedAt: number): Promise<void>;

  upsertRemoteScheduledTaskProjection(task: ScheduledTask, observedAt: number): Promise<void>;

  deleteRemoteScheduledTaskProjection(taskId: string, executionNodeId: string): Promise<void>;

  /**
   * Return next N run times for a cron expression (for UI preview).
   */
  getCronPreviewDates(expression: string, timezone?: string, count?: number): Promise<string[]>;
}

/** Main-process-only lifecycle; deliberately absent from the renderer IPC descriptor. */
export interface IAgentInstanceLifecycle {
  dispose(): Promise<void>;
}

export const AgentInstanceServiceIPCDescriptor = {
  channel: AgentChannel.instance,
  properties: {
    cancelAgent: ProxyPropertyType.Function,
    cancelAgentRun: ProxyPropertyType.Function,
    cancelPromptPreview: ProxyPropertyType.Function,
    abortAgentAttachmentUpload: ProxyPropertyType.Function,
    beginAgentAttachmentUpload: ProxyPropertyType.Function,
    closeAgent: ProxyPropertyType.Function,
    concatPrompt: ProxyPropertyType.Function$,
    concatPromptPreview: ProxyPropertyType.Function$,
    createAgent: ProxyPropertyType.Function,
    debounceUpdateMessage: ProxyPropertyType.Function,
    deleteAgent: ProxyPropertyType.Function,
    deleteMessages: ProxyPropertyType.Function,
    commitAgentAttachmentUpload: ProxyPropertyType.Function,
    getAgentMetadata: ProxyPropertyType.Function,
    getAgentRunStatus: ProxyPropertyType.Function,
    getAgentMessagePage: ProxyPropertyType.Function,
    getAgentMessageIdentity: ProxyPropertyType.Function,
    readAgentMessageDetailRange: ProxyPropertyType.Function,
    getAgentMessageWindowAround: ProxyPropertyType.Function,
    getAgentConversationListPage: ProxyPropertyType.Function,
    getAgentConversationTimelinePage: ProxyPropertyType.Function,
    getMaxAgentLamportClock: ProxyPropertyType.Function,
    getExistingAgentMessageIds: ProxyPropertyType.Function,
    getAgentMessage: ProxyPropertyType.Function,
    getAgentTurnDetail: ProxyPropertyType.Function,
    deleteConversationTurn: ProxyPropertyType.Function,
    retryConversationTurn: ProxyPropertyType.Function,
    getLatestContextCompactionSummary: ProxyPropertyType.Function,
    deleteAgentTurn: ProxyPropertyType.Function,
    getAgents: ProxyPropertyType.Function,
    getFrameworkConfigSchema: ProxyPropertyType.Function,
    getPromptPreviewAuditDetail: ProxyPropertyType.Function,
    getPromptPreviewAuditPage: ProxyPropertyType.Function,
    resolveToolApproval: ProxyPropertyType.Function,
    resolveAskQuestion: ProxyPropertyType.Function,
    saveUserMessage: ProxyPropertyType.Function,
    rollbackTurn: ProxyPropertyType.Function,
    executeAgentRun: ProxyPropertyType.Function,
    releasePromptPreviewAuditSession: ProxyPropertyType.Function,
    subscribeToAgentUpdates: ProxyPropertyType.Function$,
    subscribeToConversationUpdates: ProxyPropertyType.Function$,
    getTurnChangedFiles: ProxyPropertyType.Function,
    getBackgroundTasks: ProxyPropertyType.Function,
    cancelBackgroundTask: ProxyPropertyType.Function,
    setBackgroundAlarm: ProxyPropertyType.Function,
    setBackgroundHeartbeat: ProxyPropertyType.Function,
    createScheduledTask: ProxyPropertyType.Function,
    updateScheduledTask: ProxyPropertyType.Function,
    deleteScheduledTask: ProxyPropertyType.Function,
    listScheduledTasks: ProxyPropertyType.Function,
    listScheduledTasksForAgent: ProxyPropertyType.Function,
    listScheduledTasksPageForAgent: ProxyPropertyType.Function,
    listRemoteScheduledTaskProjectionPageForAgent: ProxyPropertyType.Function,
    preparePromptPreviewExecutionModelRequest: ProxyPropertyType.Function,
    replaceRemoteScheduledTaskProjections: ProxyPropertyType.Function,
    upsertRemoteScheduledTaskProjection: ProxyPropertyType.Function,
    deleteRemoteScheduledTaskProjection: ProxyPropertyType.Function,
    getCronPreviewDates: ProxyPropertyType.Function,
    updateAgent: ProxyPropertyType.Function,
    writeAgentAttachmentChunk: ProxyPropertyType.Function,
    prepareRemoteAgentUserMessage: ProxyPropertyType.Function,
    readAgentAttachmentChunk: ProxyPropertyType.Function,
  },
};
