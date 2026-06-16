import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { AgentInstance, AgentInstanceLatestStatus, AgentPromptDescription, ChatMessage, PromptConcatStreamState } from 'memeloop';
import type { Observable } from 'rxjs';

import { AgentChannel } from '@/constants/channels';
import type { CreateScheduledTaskInput, ScheduledTask, UpdateScheduledTaskInput } from './tools/scheduledTaskTypes';

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
  concatPrompt(promptDescription: Pick<AgentPromptDescription, 'agentFrameworkConfig'>, messages: ChatMessage[]): Observable<PromptConcatStreamState>;

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
