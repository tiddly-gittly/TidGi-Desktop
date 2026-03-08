import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { Observable } from 'rxjs';

import { AgentChannel } from '@/constants/channels';
import { AgentDefinition } from '@services/agentDefinition/interface';
import { PromptConcatStreamState } from '@services/agentInstance/promptConcat/promptConcat';
import { AgentPromptDescription } from '@services/agentInstance/promptConcat/promptConcatSchema';
import type { CreateScheduledTaskInput, ScheduledTask, UpdateScheduledTaskInput } from './scheduledTaskManager';

/**
 * Content of a session instance that user chat with an agent.
 * Inherits import { AgentFrameworkConfig } optional to allow fallback.
 * The instance can override the definition's configuration, or fall back to using it.
 */
export interface AgentInstance extends Omit<AgentDefinition, 'name' | 'agentFrameworkConfig'> {
  /** Agent description ID that generates this instance */
  agentDefId: string;
  /** Session name, optional in instance unlike definition */
  name?: string;
  /** Agent framework's config - optional, falls back to AgentDefinition.agentFrameworkConfig if not set */
  agentFrameworkConfig?: Record<string, unknown>;
  /**
   * Message history.
   * latest on top, so it's easy to get first one as user's latest input, and rest as history.
   */
  messages: AgentInstanceMessage[];
  status: AgentInstanceLatestStatus;
  /** Session creation time (converted from ISO string) */
  created: Date;
  /**
   * Last update time (converted from ISO string).
   * We don't need `created` for message because it might be stream generated, we only care about its complete time.
   */
  modified?: Date;
  /**
   * Indicates whether this agent instance is closed. Closed instances are not deleted from database
   * but are hidden from the default list and don't consume resources.
   */
  closed?: boolean;
  /**
   * Indicates whether this agent instance is a preview instance used for testing during agent creation.
   * Preview instances are excluded from normal agent instance lists and should be cleaned up automatically.
   */
  volatile?: boolean;
  /**
   * Indicates this instance was spawned by another agent (sub-agent).
   * Sub-agent instances are hidden from the default user-facing list.
   */
  isSubAgent?: boolean;
  /** Parent agent instance ID if this is a sub-agent */
  parentAgentId?: string;
}

/**
 * Represents the state of a task within the A2A protocol.
 * @description An enumeration.
 */
export type AgentInstanceState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'canceled'
  | 'failed'
  | 'unknown';

/**
 * Represents the status of a task at a specific point in time.
 */
export interface AgentInstanceLatestStatus {
  /**
   * The current state of the task.
   */
  state: AgentInstanceState;

  /**
   * An optional message associated with the current status (e.g., progress update, final response).
   * @default undefined
   */
  message?: AgentInstanceMessage;

  /** Creation time (converted from ISO string) */
  created?: Date;
  /** Last update time (converted from ISO string) */
  modified?: Date;
}

export interface AgentInstanceMessage {
  /** Message nano ID */
  id: string;
  agentId: string;
  /** Message role */
  role: 'user' | 'assistant' | 'agent' | 'tool' | 'error';
  /** Message content */
  content: string;
  /**
   * Reasoning or thinking content, separated from main content
   * Primarily used with DeepSeek which returns reasoning content separately
   */
  reasoning_content?: string;
  contentType?: string; // 'text/plain' | 'text/markdown' | 'text/html' | 'application/json' | 'application/json+ndjson';
  /** Creation time (converted from ISO string) */
  created?: Date;
  /** Last update time (converted from ISO string) */
  modified?: Date;
  /** Message metadata */
  metadata?: Record<string, unknown>;
  /** Whether this message should be hidden from UI/history (default: false) */
  hidden?: boolean;
  /**
   * Duration in rounds that this message should be included in AI context
   * When set to a number > 0, the message will only be sent to AI for that many rounds from current position
   * undefined/null means the message persists in AI context indefinitely (default behavior)
   * 0 means the message is excluded from AI context immediately but remains visible in UI
   */
  duration?: number | null;
}

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
  repeatIntervalMinutes?: number;
  createdBy?: string;
  lastRunAtISO?: string;
  runCount?: number;
}

export interface SetBackgroundAlarmInput {
  wakeAtISO: string;
  message?: string;
  repeatIntervalMinutes?: number;
}

export interface SetBackgroundHeartbeatInput {
  enabled: boolean;
  intervalSeconds: number;
  message?: string;
  activeHoursStart?: string;
  activeHoursEnd?: string;
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
  createAgent(agentDefinitionID?: string, options?: { preview?: boolean; volatile?: boolean }): Promise<AgentInstance>;

  /**
   * Send a message or file to an agent instance, and put response to observables. Persistence and tool calling is handled by the plugins.
   * @param agentId Agent ID
   * @param content Message content including text, optional file, and optional wiki tiddlers
   */
  sendMsgToAgent(agentId: string, content: {
    text: string;
    file?: File;
    /**
     * Wiki tiddlers to attach. Each entry contains workspace name and tiddler title.
     * The rendered HTML content of these tiddlers will be fetched and included in the prompt.
     */
    wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }>;
  }): Promise<void>;

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

  /**
   * Get agent instance data by ID
   * @param agentId Agent instance ID
   */
  getAgent(agentId: string): Promise<AgentInstance | undefined>;

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
  concatPrompt(promptDescription: Pick<AgentPromptDescription, 'agentFrameworkConfig'>, messages: AgentInstanceMessage[]): Observable<PromptConcatStreamState>;

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
  saveUserMessage(userMessage: AgentInstanceMessage): Promise<void>;

  /**
   * Debounced message update to reduce database writes
   * Made public so plugins can use it for UI updates
   * @param message Message to update
   * @param agentId Agent ID for status subscribers
   * @param debounceMs Debounce delay in milliseconds
   */
  debounceUpdateMessage(message: AgentInstanceMessage, agentId?: string, debounceMs?: number): void;

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
  createScheduledTask(input: CreateScheduledTaskInput): Promise<ScheduledTask>;

  /**
   * Update an existing scheduled task (restarts timer with new config).
   */
  updateScheduledTask(input: UpdateScheduledTaskInput): Promise<ScheduledTask>;

  /**
   * Delete a scheduled task and stop its timer.
   */
  deleteScheduledTask(taskId: string): Promise<void>;

  /**
   * List all active scheduled tasks (from in-memory registry).
   */
  listScheduledTasks(): Promise<ScheduledTask[]>;

  /**
   * List active scheduled tasks for a specific agent instance.
   * Used by TabItem to show the clock indicator.
   */
  listScheduledTasksForAgent(agentInstanceId: string): Promise<ScheduledTask[]>;

  /**
   * Return next N run times for a cron expression (for UI preview).
   */
  getCronPreviewDates(expression: string, timezone?: string, count?: number): Promise<string[]>;
}

export const AgentInstanceServiceIPCDescriptor = {
  channel: AgentChannel.instance,
  properties: {
    cancelAgent: ProxyPropertyType.Function,
    closeAgent: ProxyPropertyType.Function,
    concatPrompt: ProxyPropertyType.Function$,
    createAgent: ProxyPropertyType.Function,
    debounceUpdateMessage: ProxyPropertyType.Function,
    deleteAgent: ProxyPropertyType.Function,
    deleteMessages: ProxyPropertyType.Function,
    getAgent: ProxyPropertyType.Function,
    getAgents: ProxyPropertyType.Function,
    getFrameworkConfigSchema: ProxyPropertyType.Function,
    resolveToolApproval: ProxyPropertyType.Function,
    resolveAskQuestion: ProxyPropertyType.Function,
    saveUserMessage: ProxyPropertyType.Function,
    rollbackTurn: ProxyPropertyType.Function,
    sendMsgToAgent: ProxyPropertyType.Function,
    subscribeToAgentUpdates: ProxyPropertyType.Function$,
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
    getCronPreviewDates: ProxyPropertyType.Function,
    updateAgent: ProxyPropertyType.Function,
  },
};
