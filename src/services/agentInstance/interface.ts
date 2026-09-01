import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type {
  AgentCommittedAttachment,
  AgentConversationMessagePage,
  AgentConversationMessagePageOptions,
  AgentConversationMessageWindowRequest,
  AgentConversationMessageWindowResult,
  AgentConversationUpdate,
  AgentDeviceRpcDeleteTurnRequest,
  AgentDeviceRpcDeleteTurnResponse,
  AgentDeviceRpcGetTurnDetailRequest,
  AgentDeviceRpcGetTurnDetailResponse,
  AgentDeviceRpcRetryTurnRequest,
  AgentDeviceRpcRetryTurnResponse,
  AgentDeviceRpcRunTurnRequest,
  AgentFrameworkConfig,
  AgentHeartbeatConfig,
  AgentInstanceLatestStatus,
  AgentInstanceMetadata,
  AgentInstanceMetadataUpdate,
  AgentManagementCallOptions,
  AgentRuntimeView,
  AttachmentReference,
  ChatMessage,
  CompactionCandidatePage,
  ConversationEvent,
  ConversationEventDraft,
  ConversationEventPage,
  ConversationFullContentMessagePage,
  ConversationListPage,
  ConversationMessageDetailRange,
  ConversationMessageIdentity,
  ConversationMessagePage,
  ConversationMeta,
  ConversationTimelinePage,
  CreateScheduledTaskInput,
  GetCompactionCandidatePageOptions,
  GetConversationEventPageOptions,
  GetConversationListPageOptions,
  GetConversationMessageWindowAroundOptions,
  GetConversationTimelinePageOptions,
  GetFullContentMessagePageOptions,
  GetMessagePageOptions,
  GetRetainedCompactionControlsOptions,
  ListScheduledTasksOptions,
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
  PromptPreviewPreparedExecution,
  PromptPreviewPrepareRequest,
  RemoteAgentExecuteRequest,
  RetainedCompactionControlPage,
  ScheduledTask,
  ScheduledTaskPage,
  ScheduledTaskRpcScopedTaskRequest,
  ScheduledTaskRpcUpdatePatch,
  ToolApprovalResolution,
} from 'memeloop';
import type { Observable } from 'rxjs';

import { AgentChannel } from '@/constants/channels';
import type { ConversationListProjectionScope } from './agentRepository';
import type {
  BeginDesktopAttachmentUploadInput,
  DesktopAttachmentUploadScope,
  ReadDesktopAgentAttachmentChunkInput,
  WriteDesktopAttachmentChunkInput,
} from './attachmentUploadProtocol';

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
  createAgent(agentDefinitionID?: string, options?: { id?: string; preview?: boolean; volatile?: boolean }): Promise<AgentRuntimeView>;
  /** Main-process only; deliberately omitted from the renderer IPC descriptor. */
  getDurableAgentRuntime(): Promise<MemeLoopRuntime>;
  /** Main-process only exact-id materialization for authenticated Device RPC. */
  ensureAgentConversation(definitionId: string, conversationId?: string): Promise<{ conversationId: string }>;

  /**
   * Main-process-only durable local execution port. It accepts an idempotent run,
   * waits for its persisted terminal state, and is intentionally omitted from IPC.
   */
  executeLocalAgentMessage(request: RemoteAgentExecuteRequest, options?: AgentManagementCallOptions): Promise<MemeLoopRunStatus>;

  /** Accept one exact-identity durable local run for the shared execution coordinator. */
  executeAgentRun(request: AgentDeviceRpcRunTurnRequest): Promise<MemeLoopRunHandle>;
  /** Read the restart-safe terminal/progress state of one durable local run. */
  getAgentRunStatus(runId: string): Promise<MemeLoopRunStatus | undefined>;
  /** Cancel one exact durable run without cancelling unrelated conversation work. */
  cancelAgentRun(runId: string): Promise<boolean>;

  beginAgentAttachmentUpload(input: BeginDesktopAttachmentUploadInput): Promise<{ uploadId: string }>;
  writeAgentAttachmentChunk(input: WriteDesktopAttachmentChunkInput): Promise<{ nextOffset: number }>;
  commitAgentAttachmentUpload(input: DesktopAttachmentUploadScope): Promise<AgentCommittedAttachment>;
  abortAgentAttachmentUpload(input: DesktopAttachmentUploadScope): Promise<void>;
  /** Prepare host-rendered wiki/attachment metadata without persisting a local turn. */
  prepareAgentDeviceRpcRunTurn(request: RemoteAgentExecuteRequest): Promise<AgentDeviceRpcRunTurnRequest>;
  /** Read only an attachment authorized for this exact conversation. */
  readAgentAttachmentChunk(input: ReadDesktopAgentAttachmentChunkInput): Promise<Uint8Array | null>;
  preparePromptPreviewExecutionModelRequest(input: PromptPreviewPrepareRequest): Promise<PromptPreviewPreparedExecution>;
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
  subscribeToAgentUpdates(agentId: string): Observable<AgentRuntimeView | undefined>;
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
  /** Metadata-only agent read for renderer views. */
  getAgentMetadata(agentId: string): Promise<AgentRuntimeView | undefined>;

  /** Exact renderer/management projection with opaque Core-owned cursors. */
  getAgentMessagePage(agentId: string, options: AgentConversationMessagePageOptions): Promise<AgentConversationMessagePage>;
  /** Main-process storage port; deliberately absent from renderer IPC. */
  getAgentStorageMessagePage(agentId: string, options: GetMessagePageOptions): Promise<ConversationMessagePage>;
  /** Trusted main-process model-context/export port; deliberately absent from renderer IPC. */
  getAgentStorageFullContentMessagePage(
    agentId: string,
    options: GetFullContentMessagePageOptions,
  ): Promise<ConversationFullContentMessagePage>;
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
  /** Bounded UTF-8 reasoning range, independent from answer and generic detail JSON. */
  readAgentMessageReasoningRange(
    agentId: string,
    messageId: string,
    offset: number,
    maxBytes: number,
  ): Promise<ConversationMessageDetailRange>;
  /** Single-transaction absolute seek around a turn/timeline focus. */
  getAgentMessageWindowAround(request: AgentConversationMessageWindowRequest): Promise<AgentConversationMessageWindowResult>;
  /** Main-process storage port; deliberately absent from renderer IPC. */
  getAgentStorageMessageWindowAround(
    agentId: string,
    options: GetConversationMessageWindowAroundOptions,
  ): Promise<import('memeloop').ConversationMessageWindowResult>;
  getAgentConversationListPage(localNodeId: string, options: GetConversationListPageOptions): Promise<ConversationListPage>;
  getAgentConversationMeta(localNodeId: string, conversationId: string): Promise<ConversationMeta | null>;
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
  /**
   * Packaged-E2E-only fixture entry point. The implementation is fail-closed
   * outside an Electron E2E process and writes through the canonical event
   * store so renderer tests exercise real SQLite projections and IPC paging.
   */
  seedLongConversationForE2E(input: {
    conversationId: string;
    turnCount: number;
  }): Promise<{
    conversationId: string;
    turnCount: number;
    messageCount: number;
    compactionCount: number;
  }>;
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
  /**
   * Update agent instance data
   * @param agentId Agent instance ID
   * @param data Updated data
   */
  updateAgent(agentId: string, data: AgentInstanceMetadataUpdate): Promise<AgentRuntimeView>;

  /**
   * Delete agent instance and all its messages
   * @param agentId Agent instance ID
   */
  deleteAgent(agentId: string): Promise<void>;

  /**
   * Irreversibly discard one renderer preview and its disposable conversation
   * rows. The main process validates that the instance is volatile before any
   * data is removed. A temporary definition is deleted only when its exact ID
   * is supplied and it is no longer referenced by another instance.
   */
  discardVolatileAgentPreview(input: {
    agentId?: string;
    temporaryDefinitionId?: string;
  }): Promise<void>;

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
  getAgents(page: number, pageSize: number, options?: { closed?: boolean; searchName?: string }): Promise<AgentInstanceMetadata[]>;

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
   * Resolve a pending tool approval request from the UI
   * @param approvalId The approval request ID
   * @param decision 'allow' or 'deny'
   */
  resolveToolApproval(resolution: ToolApprovalResolution): Promise<boolean>;

  /**
   * Resolve an ask-question request from the UI through one idempotent durable
   * answer turn. The promise settles only after that answer run is terminal.
   * @param agentId The agent instance ID
   * @param questionId The question ID embedded in the ask-question tool result
   * @param answer The user's answer text
   */
  resolveAskQuestion(agentId: string, questionId: string, answer: string): Promise<void>;

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

  /** Main-process heartbeat binding using the exact canonical definition field. */
  setAgentHeartbeat(agentId: string, heartbeat: AgentHeartbeatConfig): Promise<void>;

  // ── ScheduledTask CRUD (Phase 2) ──────────────────────────────────────────

  /**
   * Create a new scheduled task and start its timer.
   */
  createScheduledTask(input: CreateScheduledTaskInput, options?: AgentManagementCallOptions): Promise<ScheduledTask>;

  /**
   * Update an existing scheduled task (restarts timer with new config).
   */
  updateScheduledTask(taskId: string, patch: ScheduledTaskRpcUpdatePatch, options?: AgentManagementCallOptions): Promise<ScheduledTask>;

  /** Main-process-only atomic full-scope mutation used by authenticated RPC. */
  updateScheduledTaskScoped(scope: ScheduledTaskRpcScopedTaskRequest, patch: ScheduledTaskRpcUpdatePatch, options?: AgentManagementCallOptions): Promise<ScheduledTask>;

  /**
   * Delete a scheduled task and stop its timer.
   */
  deleteScheduledTask(taskId: string): Promise<void>;

  /** Main-process-only atomic full-scope soft delete used by authenticated RPC. */
  deleteScheduledTaskScoped(scope: ScheduledTaskRpcScopedTaskRequest, options?: AgentManagementCallOptions): Promise<void>;

  /** Main-process-only full-scope lookup used by authenticated RPC. */
  getScheduledTaskByScope(scope: ScheduledTaskRpcScopedTaskRequest, options?: AgentManagementCallOptions): Promise<ScheduledTask | undefined>;

  /**
   * List all active scheduled tasks (from in-memory registry).
   */
  listScheduledTasks(options?: ListScheduledTasksOptions): Promise<ScheduledTask[]>;

  /**
   * List active scheduled tasks for a specific agent instance.
   * Used by TabItem to show the clock indicator.
   */
  listScheduledTasksForAgent(agentInstanceId: string, options?: ListScheduledTasksOptions): Promise<ScheduledTaskPage>;

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
    concatPromptPreview: ProxyPropertyType.Function$,
    createAgent: ProxyPropertyType.Function,
    deleteAgent: ProxyPropertyType.Function,
    discardVolatileAgentPreview: ProxyPropertyType.Function,
    commitAgentAttachmentUpload: ProxyPropertyType.Function,
    getAgentMetadata: ProxyPropertyType.Function,
    getAgentRunStatus: ProxyPropertyType.Function,
    getAgentMessagePage: ProxyPropertyType.Function,
    getAgentMessageIdentity: ProxyPropertyType.Function,
    readAgentMessageDetailRange: ProxyPropertyType.Function,
    readAgentMessageReasoningRange: ProxyPropertyType.Function,
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
    seedLongConversationForE2E: ProxyPropertyType.Function,
    getAgents: ProxyPropertyType.Function,
    getFrameworkConfigSchema: ProxyPropertyType.Function,
    getPromptPreviewAuditDetail: ProxyPropertyType.Function,
    getPromptPreviewAuditPage: ProxyPropertyType.Function,
    resolveToolApproval: ProxyPropertyType.Function,
    resolveAskQuestion: ProxyPropertyType.Function,
    rollbackTurn: ProxyPropertyType.Function,
    executeAgentRun: ProxyPropertyType.Function,
    releasePromptPreviewAuditSession: ProxyPropertyType.Function,
    subscribeToAgentUpdates: ProxyPropertyType.Function$,
    subscribeToConversationUpdates: ProxyPropertyType.Function$,
    getTurnChangedFiles: ProxyPropertyType.Function,
    createScheduledTask: ProxyPropertyType.Function,
    updateScheduledTask: ProxyPropertyType.Function,
    deleteScheduledTask: ProxyPropertyType.Function,
    listScheduledTasks: ProxyPropertyType.Function,
    listScheduledTasksForAgent: ProxyPropertyType.Function,
    preparePromptPreviewExecutionModelRequest: ProxyPropertyType.Function,
    getCronPreviewDates: ProxyPropertyType.Function,
    updateAgent: ProxyPropertyType.Function,
    writeAgentAttachmentChunk: ProxyPropertyType.Function,
    prepareAgentDeviceRpcRunTurn: ProxyPropertyType.Function,
    readAgentAttachmentChunk: ProxyPropertyType.Function,
  },
};
