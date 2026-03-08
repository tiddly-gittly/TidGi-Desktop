import { inject, injectable } from 'inversify';
import { nanoid } from 'nanoid';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataSource, Repository } from 'typeorm';

import type { AgentHeartbeatConfig } from '@services/agentDefinition/interface';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { basicPromptConcatHandler } from '@services/agentInstance/agentFrameworks/taskAgent';
import type { AgentFramework, AgentFrameworkContext } from '@services/agentInstance/agentFrameworks/utilities/type';
import { promptConcatStream, PromptConcatStreamState } from '@services/agentInstance/promptConcat/promptConcat';
import type { AgentPromptDescription } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { getPromptConcatAgentFrameworkConfigJsonSchema } from '@services/agentInstance/promptConcat/promptConcatSchema/jsonSchema';
import { createHooksWithPlugins, initializePluginSystem } from '@services/agentInstance/tools';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import type { IGitService } from '@services/git/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';

import { createDebouncedMessageUpdater, saveUserMessage as saveUserMessageHelper } from './agentMessagePersistence';
import * as repo from './agentRepository';
import { getActiveHeartbeatEntries, startHeartbeat, stopHeartbeat } from './heartbeatManager';
import type {
  AgentBackgroundTask,
  AgentInstance,
  AgentInstanceLatestStatus,
  AgentInstanceMessage,
  IAgentInstanceService,
  SetBackgroundAlarmInput,
  SetBackgroundHeartbeatInput,
} from './interface';
import type { CreateScheduledTaskInput, ScheduledTask, UpdateScheduledTaskInput } from './scheduledTaskManager';
import {
  addTask as stmAddTask,
  cancelTasksForAgent,
  getActiveTasks as stmGetActiveTasks,
  getActiveTasksForAgent as stmGetActiveTasksForAgent,
  getCronPreviewDates as stmGetCronPreviewDates,
  initScheduledTaskManager,
  removeTask as stmRemoveTask,
  restoreScheduledTasks,
  updateTask as stmUpdateTask,
} from './scheduledTaskManager';
import { cancelAlarm, getActiveAlarmEntries, scheduleAlarmTimer } from './tools/alarmClock';
import { cleanupMCPClient } from './tools/modelContextProtocol';

@injectable()
export class AgentInstanceService implements IAgentInstanceService {
  @inject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @inject(serviceIdentifier.AgentDefinition)
  private readonly agentDefinitionService!: IAgentDefinitionService;

  private dataSource: DataSource | null = null;
  private agentInstanceRepository: Repository<AgentInstanceEntity> | null = null;
  private agentMessageRepository: Repository<AgentInstanceMessageEntity> | null = null;
  private scheduledTaskRepositoryReady = false;

  private agentInstanceSubjects: Map<string, BehaviorSubject<AgentInstance | undefined>> = new Map();
  private statusSubjects: Map<string, BehaviorSubject<AgentInstanceLatestStatus | undefined>> = new Map();

  private agentFrameworks: Map<string, AgentFramework> = new Map();
  private frameworkSchemas: Map<string, Record<string, unknown>> = new Map();
  private cancelTokenMap: Map<string, { value: boolean }> = new Map();
  private debouncedUpdateFunctions: Map<string, (message: AgentInstanceLatestStatus['message'] & { id: string }, agentId?: string) => void> = new Map();

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
      this.dataSource = await this.databaseService.getDatabase('agent');
      this.agentInstanceRepository = this.dataSource.getRepository(AgentInstanceEntity);
      this.agentMessageRepository = this.dataSource.getRepository(AgentInstanceMessageEntity);

      // Initialize the unified ScheduledTaskManager
      const { ScheduledTaskEntity } = await import('@services/database/schema/agent');
      const stmRepo = this.dataSource.getRepository(ScheduledTaskEntity);
      initScheduledTaskManager(stmRepo, this);
      this.scheduledTaskRepositoryReady = true;

      logger.debug('AgentInstance repositories initialized');
    } catch (error) {
      logger.error('Failed to initialize agent instance database', { error });
      throw error;
    }
  }

  public async initializeFrameworks(): Promise<void> {
    try {
      // Register tools to global registry once during initialization
      await initializePluginSystem();
      logger.debug('AgentInstance Tool system initialized and tools registered to global registry');

      // Register built-in frameworks
      this.registerBuiltinFrameworks();
      logger.debug('AgentInstance frameworks registered');
    } catch (error) {
      logger.error('Failed to initialize agent instance frameworks', { error });
      throw error;
    }
  }

  public registerBuiltinFrameworks(): void {
    // Tools are already registered in initialize(), so we only register frameworks here
    // Register basic prompt concatenation framework with its schema
    this.registerFramework('basicPromptConcatHandler', basicPromptConcatHandler, getPromptConcatAgentFrameworkConfigJsonSchema());
  }

  /**
   * Restore heartbeat timers and alarm timers for active agents after app restart.
   * Heartbeats: read from AgentDefinition.heartbeat for all non-closed instances.
   * Alarms: read from AgentInstance.scheduledAlarm for all non-closed instances.
   */
  private async restoreBackgroundTasks(): Promise<void> {
    if (!this.agentInstanceRepository) return;
    try {
      // Find all non-closed, non-volatile agent instances with their definitions
      const activeInstances = await this.agentInstanceRepository.find({
        where: { closed: false, volatile: false },
        relations: ['agentDefinition'],
      });

      let heartbeatsRestored = 0;
      let alarmsRestored = 0;

      for (const instance of activeInstances) {
        // Restore heartbeat from definition
        const heartbeatConfig = instance.agentDefinition?.heartbeat;
        if (heartbeatConfig?.enabled) {
          startHeartbeat(instance.id, heartbeatConfig, this, { createdBy: 'agent-definition' });
          heartbeatsRestored++;
        }

        // Restore persisted alarm
        const alarm = instance.scheduledAlarm;
        if (alarm?.wakeAtISO) {
          const wakeAt = new Date(alarm.wakeAtISO);
          const now = new Date();
          // For one-shot alarms in the past, fire immediately
          // For recurring alarms, always restore
          if (alarm.repeatIntervalMinutes || wakeAt.getTime() > now.getTime()) {
            scheduleAlarmTimer(instance.id, alarm.wakeAtISO, alarm.reminderMessage, alarm.repeatIntervalMinutes, {
              createdBy: alarm.createdBy ?? 'restore',
              runCount: alarm.runCount,
              lastRunAtISO: alarm.lastRunAtISO,
            });
            alarmsRestored++;
          } else {
            // Past one-shot alarm — fire it now and clear
            scheduleAlarmTimer(instance.id, new Date().toISOString(), alarm.reminderMessage, undefined, {
              createdBy: alarm.createdBy ?? 'restore',
              runCount: alarm.runCount,
              lastRunAtISO: alarm.lastRunAtISO,
            });
            alarmsRestored++;
          }
        }
      }

      if (heartbeatsRestored > 0 || alarmsRestored > 0) {
        logger.info('Background tasks restored', { heartbeatsRestored, alarmsRestored, totalInstances: activeInstances.length });
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
      const { ScheduledTaskEntity } = await import('@services/database/schema/agent');
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
   * Register a framework with an optional schema
   * @param frameworkId ID for the framework
   * @param framework The framework function
   * @param schema Optional JSON schema for the framework configuration
   */
  private registerFramework(frameworkId: string, framework: AgentFramework, schema?: Record<string, unknown>): void {
    this.agentFrameworks.set(frameworkId, framework);
    if (schema) {
      this.frameworkSchemas.set(frameworkId, schema);
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

  /**
   * Clean up subscriptions for specific agent
   */
  private cleanupAgentSubscriptions(agentId: string): void {
    if (this.agentInstanceSubjects.has(agentId)) {
      this.agentInstanceSubjects.delete(agentId);
    }

    // Clean up all status subscriptions related to this agent
    for (const [key, _] of this.statusSubjects.entries()) {
      if (key.startsWith(`${agentId}:`)) {
        this.statusSubjects.delete(key);
      }
    }
  }

  public async createAgent(agentDefinitionID?: string, options?: { preview?: boolean; volatile?: boolean }): Promise<AgentInstance> {
    this.ensureRepositories();
    try {
      return await repo.createAgent(this.agentInstanceRepository!, this.agentDefinitionService, agentDefinitionID, options);
    } catch (error) {
      logger.error('Failed to create agent instance', { error });
      throw error;
    }
  }

  public async getAgent(agentId: string): Promise<AgentInstance | undefined> {
    this.ensureRepositories();
    try {
      return await repo.getAgent(this.agentInstanceRepository!, agentId);
    } catch (error) {
      logger.error('Failed to get agent instance', { error });
      throw error;
    }
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
      cancelAlarm(agentId);
      cancelTasksForAgent(agentId);
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

  public async sendMsgToAgent(agentId: string, content: { text: string; file?: File; wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }> }): Promise<void> {
    try {
      // Get agent instance
      const agentInstance = await this.getAgent(agentId);
      if (!agentInstance) {
        throw new Error(`Agent instance not found: ${agentId}`);
      }

      // Create user message
      const messageId = nanoid();
      const now = new Date();

      // Get agent configuration
      const agentDefinition = await this.agentDefinitionService.getAgentDef(agentInstance.agentDefId);
      if (!agentDefinition) {
        throw new Error(`Agent definition not found: ${agentInstance.agentDefId}`);
      }

      // Get appropriate framework
      const agentFrameworkId = agentDefinition.agentFrameworkID;
      if (!agentFrameworkId) {
        throw new Error(`Agent framework ID not found in agent definition: ${agentDefinition.id}`);
      }
      const framework = this.agentFrameworks.get(agentFrameworkId);
      if (!framework) {
        throw new Error(`Framework not found: ${agentFrameworkId}`);
      }

      // Create framework context with temporary message added for processing
      const cancelToken = { value: false };
      this.cancelTokenMap.set(agentId, cancelToken);
      const frameworkContext: AgentFrameworkContext = {
        agent: {
          ...agentInstance,
          messages: [...agentInstance.messages],
          status: {
            state: 'working',
            modified: now,
          },
        },
        agentDef: agentDefinition,
        isCancelled: () => cancelToken.value,
      };

      // Create fresh hooks for this framework execution and register plugins based on frameworkConfig
      const { hooks: frameworkHooks } = await createHooksWithPlugins(agentDefinition.agentFrameworkConfig || {});

      // Record HEAD commit hashes for all wiki workspaces before the agent turn starts.
      // This allows rollback by comparing with commits made during the turn.
      const beforeCommitMap: Record<string, { wikiFolderLocation: string; commitHash: string }> = {};
      try {
        const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
        const gitService = container.get<IGitService>(serviceIdentifier.Git);
        const workspaces = await workspaceService.getWorkspacesAsList();
        for (const ws of workspaces) {
          if (isWikiWorkspace(ws)) {
            try {
              const hash = await gitService.callGitOp('getHeadCommitHash', ws.wikiFolderLocation);
              beforeCommitMap[ws.id] = { wikiFolderLocation: ws.wikiFolderLocation, commitHash: hash };
            } catch {
              // Workspace may not have git initialized — skip silently
            }
          }
        }
        logger.debug('Recorded before-turn commit hashes', { agentId, workspaceCount: Object.keys(beforeCommitMap).length });
      } catch (error) {
        logger.warn('Failed to record before-turn commit hashes', { error });
      }

      // Trigger userMessageReceived hook with the configured tools
      await frameworkHooks.userMessageReceived.promise({
        agentFrameworkContext: frameworkContext,
        content,
        messageId,
        timestamp: now,
      });

      // Attach beforeCommitMap to the user message metadata after it's created by the messagePersistence hook.
      // This allows the frontend to know which commit hash to rollback to for this turn.
      if (Object.keys(beforeCommitMap).length > 0) {
        const userMessage = frameworkContext.agent.messages.find(m => m.id === messageId);
        if (userMessage) {
          userMessage.metadata = { ...userMessage.metadata, beforeCommitMap };
          // Persist the updated metadata
          void this.saveUserMessage(userMessage).catch((error: unknown) => {
            logger.warn('Failed to persist beforeCommitMap metadata', { error, messageId });
          });
        }
      }

      // Notify agent update after user message is added
      this.notifyAgentUpdate(agentId, frameworkContext.agent);

      try {
        // Create async generator
        const generator = framework(frameworkContext);

        // Track the last message for completion handling
        let lastResult: AgentInstanceLatestStatus | undefined;

        for await (const result of generator) {
          // Update status subscribers for specific message
          if (result.message) {
            // Ensure message has correct modification timestamp
            if (!result.message.modified) {
              result.message.modified = new Date();
            }

            // Update status subscribers directly
            const statusKey = `${agentId}:${result.message.id}`;
            if (this.statusSubjects.has(statusKey)) {
              this.statusSubjects.get(statusKey)?.next(result);
            }

            // Notify agent update with latest messages for real-time UI updates
            // (even if content is empty — tool results and state changes need broadcasting)
            this.notifyAgentUpdate(agentId, frameworkContext.agent);
          }

          // Store the last result for completion handling
          lastResult = result;
        }

        // Handle stream completion
        if (lastResult?.message) {
          // Complete the message stream directly using the last message from the generator
          const statusKey = `${agentId}:${lastResult.message.id}`;
          const subject = this.statusSubjects.get(statusKey);
          if (subject) {
            const finalState = lastResult.state ?? 'completed';
            logger.debug(`[${agentId}] Completing message stream`, { messageId: lastResult.message.id, finalState });
            // Send final update with the actual terminal state from the generator
            subject.next({
              state: finalState,
              message: lastResult.message,
              modified: new Date(),
            });
            // Complete and clean up the Observable
            // Use queueMicrotask to ensure IPC message delivery before completing subject
            // This schedules the completion after the current synchronous code and pending microtasks
            queueMicrotask(() => {
              try {
                subject.complete();
                this.statusSubjects.delete(statusKey);
                logger.debug(`[${agentId}] Subject completed and deleted`, { messageId: lastResult.message?.id });
              } catch (error) {
                logger.error(`[${agentId}] Error completing subject`, { messageId: lastResult.message?.id, error });
              }
            });
          }

          // Trigger agentStatusChanged hook with actual terminal state (completed, input-required, etc.)
          const terminalState = (lastResult.state ?? 'completed') as 'working' | 'completed' | 'failed' | 'canceled';
          await frameworkHooks.agentStatusChanged.promise({
            agentFrameworkContext: frameworkContext,
            status: {
              state: terminalState,
              modified: new Date(),
            },
          });

          // Start heartbeat timer if the agent definition has heartbeat config
          if (agentDefinition.heartbeat?.enabled && !agentInstance.volatile) {
            startHeartbeat(agentId, agentDefinition.heartbeat, this, { createdBy: 'agent-definition' });
          }
        }

        // Remove cancel token after generator completes
        this.cancelTokenMap.delete(agentId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Agent handler execution failed: ${errorMessage}`);

        // Clear any pending message subscriptions for this agent
        for (const key of Array.from(this.statusSubjects.keys())) {
          if (key.startsWith(`${agentId}:`)) {
            const subject = this.statusSubjects.get(key);
            if (subject) {
              try {
                subject.next({
                  state: 'failed',
                  message: {} as AgentInstanceMessage,
                  modified: new Date(),
                });
                subject.complete();
              } catch {
                // ignore
              }
              this.statusSubjects.delete(key);
            }
          }
        }

        // Trigger agentStatusChanged hook for failure
        await frameworkHooks.agentStatusChanged.promise({
          agentFrameworkContext: frameworkContext,
          status: {
            state: 'failed',
            modified: new Date(),
          },
        }).catch(() => {
          // Ignore hook errors during error handling
        });

        // Remove cancel token
        this.cancelTokenMap.delete(agentId);
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send message to agent: ${errorMessage}`);
      throw error;
    }
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

    // Try to get cancel token
    const cancelToken = this.cancelTokenMap.get(agentId);

    if (cancelToken) {
      // Set cancel flag
      cancelToken.value = true;

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
          const agent = await this.getAgent(agentId);
          if (agent && agent.messages) {
            for (const key of Array.from(this.statusSubjects.keys())) {
              if (key.startsWith(`${agentId}:`)) {
                const parts = key.split(':');
                const messageId = parts[1];
                const subject = this.statusSubjects.get(key);
                const message = agent.messages.find(m => m.id === messageId);
                if (subject) {
                  try {
                    const message_ = message || ({} as AgentInstanceMessage);
                    logger.debug('propagate canceled to subscription', { function: 'cancelAgent', subscriptionKey: key });
                    subject.next({
                      state: 'canceled',
                      message: message_,
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
      cancelAlarm(agentId);
      cancelTasksForAgent(agentId);
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
      // Reuse sendMsgToAgent with the answer text.
      // The answer goes in as a user message so the framework can process it normally.
      // The UI will display it as a regular message (not a tool result).
      // This is the simplest approach that works with the existing framework architecture.
      await this.sendMsgToAgent(agentId, { text: answer });
      logger.debug('Ask-question resolved via sendMsgToAgent', { questionId, agentId });
    } catch (error) {
      logger.error('Failed to resolve ask-question', { questionId, error });
    }
  }

  public async deleteMessages(agentId: string, messageIds: string[]): Promise<void> {
    if (!this.agentMessageRepository || !this.agentInstanceRepository) {
      throw new Error('Database not initialized');
    }
    if (messageIds.length === 0) return;

    await this.agentMessageRepository.delete(messageIds);

    // Also update the in-memory agent messages list
    const agent = await this.agentInstanceRepository.findOne({
      where: { id: agentId },
      relations: ['messages'],
    });
    if (agent) {
      const deletedSet = new Set(messageIds);
      agent.messages = (agent.messages ?? []).filter(m => !deletedSet.has(m.id));
      await this.agentInstanceRepository.save(agent);
    }
  }

  public async getTurnChangedFiles(agentId: string, userMessageId: string): Promise<Array<{ path: string; status: string }>> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent instance not found: ${agentId}`);
    }

    const userMessage = agent.messages.find(m => m.id === userMessageId);
    if (!userMessage) {
      throw new Error(`User message not found: ${userMessageId}`);
    }

    const beforeCommitMap = userMessage.metadata?.beforeCommitMap as Record<string, { wikiFolderLocation: string; commitHash: string }> | undefined;
    if (!beforeCommitMap || Object.keys(beforeCommitMap).length === 0) {
      return [];
    }

    const allChangedFiles: Array<{ path: string; status: string }> = [];
    const gitService = container.get<IGitService>(serviceIdentifier.Git);

    for (const [_workspaceId, { wikiFolderLocation, commitHash }] of Object.entries(beforeCommitMap)) {
      try {
        const changedFiles = await gitService.callGitOp('getChangedFilesBetweenCommits', wikiFolderLocation, commitHash);
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
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent instance not found: ${agentId}`);
    }

    const userMessage = agent.messages.find(m => m.id === userMessageId);
    if (!userMessage) {
      throw new Error(`User message not found: ${userMessageId}`);
    }

    const beforeCommitMap = userMessage.metadata?.beforeCommitMap as Record<string, { wikiFolderLocation: string; commitHash: string }> | undefined;
    if (!beforeCommitMap || Object.keys(beforeCommitMap).length === 0) {
      return { rolledBack: 0, errors: ['No commit snapshot recorded for this turn'] };
    }

    let rolledBack = 0;
    const errors: string[] = [];
    const gitService = container.get<IGitService>(serviceIdentifier.Git);

    for (const [_workspaceId, { wikiFolderLocation, commitHash }] of Object.entries(beforeCommitMap)) {
      try {
        // Get the list of files that changed since the beforeCommitHash
        const changedFiles = await gitService.callGitOp('getChangedFilesBetweenCommits', wikiFolderLocation, commitHash);

        if (changedFiles.length === 0) continue;

        // Restore each file to its state at the beforeCommitHash
        for (const file of changedFiles) {
          try {
            await gitService.callGitOp('restoreFileFromCommit', wikiFolderLocation, commitHash, file.path);
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
    userMessage.metadata = { ...userMessage.metadata, rolledBack: true, rollbackTimestamp: new Date().toISOString() };
    await this.saveUserMessage(userMessage);

    return { rolledBack, errors };
  }

  public async getBackgroundTasks(): Promise<AgentBackgroundTask[]> {
    const tasks: AgentBackgroundTask[] = [];

    // Collect heartbeats from in-memory registry
    const heartbeatEntries = getActiveHeartbeatEntries();
    for (const heartbeatEntry of heartbeatEntries) {
      const agentId = heartbeatEntry.agentId;
      const agent = await this.getAgent(agentId);
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

    // Collect alarms from in-memory registry
    const alarmEntries = getActiveAlarmEntries();
    for (const alarmEntry of alarmEntries) {
      const agentId = alarmEntry.agentId;
      const agent = await this.getAgent(agentId);
      tasks.push({
        agentId,
        agentName: agent?.name,
        type: 'alarm',
        wakeAtISO: alarmEntry.wakeAtISO,
        nextWakeAtISO: alarmEntry.nextWakeAtISO,
        message: alarmEntry.reminderMessage,
        repeatIntervalMinutes: alarmEntry.repeatIntervalMinutes,
        createdBy: alarmEntry.createdBy,
        lastRunAtISO: alarmEntry.lastRunAtISO,
        runCount: alarmEntry.runCount,
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

    const repeatIntervalMinutes = alarm.repeatIntervalMinutes && alarm.repeatIntervalMinutes > 0
      ? alarm.repeatIntervalMinutes
      : undefined;
    const wakeAtISO = parsedWakeAt.toISOString();

    scheduleAlarmTimer(agentId, wakeAtISO, alarm.message, repeatIntervalMinutes, {
      createdBy: 'settings-ui',
      runCount: 0,
    });

    await this.agentInstanceRepository!.update(agentId, {
      scheduledAlarm: {
        wakeAtISO,
        reminderMessage: alarm.message,
        repeatIntervalMinutes,
        createdBy: 'settings-ui',
        runCount: 0,
      },
    });

    logger.info('Background alarm upserted from UI', {
      agentId,
      wakeAtISO,
      repeatIntervalMinutes,
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

  public async createScheduledTask(input: CreateScheduledTaskInput): Promise<ScheduledTask> {
    return stmAddTask(input);
  }

  public async updateScheduledTask(input: UpdateScheduledTaskInput): Promise<ScheduledTask> {
    return stmUpdateTask(input);
  }

  public async deleteScheduledTask(taskId: string): Promise<void> {
    return stmRemoveTask(taskId);
  }

  public async listScheduledTasks(): Promise<ScheduledTask[]> {
    return stmGetActiveTasks();
  }

  public async listScheduledTasksForAgent(agentInstanceId: string): Promise<ScheduledTask[]> {
    return stmGetActiveTasksForAgent(agentInstanceId);
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
        this.getAgent(agentId).then(agent => {
          if (agent) {
            const message = agent.messages.find(m => m.id === messageId);
            if (message) {
              // 创建状态对象，注意不再检查 isComplete
              const status: AgentInstanceLatestStatus = {
                state: agent.status.state,
                message,
                modified: message.modified,
              };

              this.statusSubjects.get(statusKey)?.next(status);
            }
          }
        }).catch((error: unknown) => {
          logger.error('Failed to get initial status for message', { function: 'subscribeToAgentUpdates', error });
        });
      }

      return this.statusSubjects.get(statusKey)!.asObservable();
    }

    // If no messageId provided, subscribe to entire agent instance updates
    if (!this.agentInstanceSubjects.has(agentId)) {
      this.agentInstanceSubjects.set(agentId, new BehaviorSubject<AgentInstance | undefined>(undefined));

      // Try to get initial data
      this.getAgent(agentId).then(agent => {
        this.agentInstanceSubjects.get(agentId)?.next(agent);
      }).catch((error: unknown) => {
        logger.error('Failed to get initial agent data', { function: 'subscribeToAgentUpdates', error });
      });
    }

    return this.agentInstanceSubjects.get(agentId)!.asObservable();
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
        // Use the provided data for notification (no database query)
        this.agentInstanceSubjects.get(agentId)?.next(agentData);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to notify agent update: ${errorMessage}`);
    }
  }

  public async saveUserMessage(userMessage: AgentInstanceMessage): Promise<void> {
    this.ensureRepositories();
    try {
      await saveUserMessageHelper(this.agentMessageRepository!, userMessage);
    } catch (error) {
      logger.error('Failed to save user message', {
        error,
        messageId: userMessage.id,
        agentId: userMessage.agentId,
      });
      throw error;
    }
  }

  public debounceUpdateMessage(
    message: AgentInstanceMessage,
    agentId?: string,
    debounceMs = 300,
  ): void {
    const messageId = message.id;

    // Update status subscribers for specific message if available
    if (agentId) {
      const statusKey = `${agentId}:${messageId}`;
      if (this.statusSubjects.has(statusKey)) {
        this.statusSubjects.get(statusKey)?.next({
          state: 'working',
          message,
          modified: message.modified ?? new Date(),
        });
      }
    }

    // Lazy-create debounced function for each message ID
    if (!this.debouncedUpdateFunctions.has(messageId)) {
      this.ensureRepositories();
      const debouncedUpdate = createDebouncedMessageUpdater(
        this.dataSource!,
        messageId,
        debounceMs,
        (aid, updatedAgent) => {
          if (this.agentInstanceSubjects.has(aid)) {
            this.agentInstanceSubjects.get(aid)?.next(updatedAgent);
            logger.debug(`Notified agent subscribers of new message: ${messageId}`, {
              method: 'debounceUpdateMessage',
              agentId: aid,
            });
          }
        },
      );
      this.debouncedUpdateFunctions.set(messageId, debouncedUpdate);
    }

    const debouncedFunction = this.debouncedUpdateFunctions.get(messageId);
    if (debouncedFunction) {
      debouncedFunction(message, agentId);
    }
  }

  public concatPrompt(promptDescription: Pick<AgentPromptDescription, 'agentFrameworkConfig'>, messages: AgentInstanceMessage[]): Observable<PromptConcatStreamState> {
    logger.debug('AgentInstanceService.concatPrompt called', {
      hasPromptConfig: !!promptDescription.agentFrameworkConfig,
      promptConfigKeys: Object.keys(promptDescription.agentFrameworkConfig || {}),
      messagesCount: messages.length,
    });

    return new Observable<PromptConcatStreamState>((observer) => {
      const processStream = async () => {
        try {
          // Create a minimal framework context for prompt concatenation
          const frameworkContext = {
            agent: {
              id: 'temp',
              messages,
              agentDefId: 'temp',
              status: { state: 'working' as const, modified: new Date() },
              created: new Date(),
              agentFrameworkConfig: {},
            },
            agentDef: { id: 'temp', name: 'temp', agentFrameworkConfig: promptDescription.agentFrameworkConfig || {} },
            isCancelled: () => false,
          };

          const streamGenerator = promptConcatStream(promptDescription as AgentPromptDescription, messages, frameworkContext);
          for await (const state of streamGenerator) {
            observer.next(state);
            if (state.isComplete) {
              observer.complete();
              break;
            }
          }
        } catch (error) {
          logger.error('Error in AgentInstanceService.concatPrompt', {
            error,
            promptDescriptionId: (promptDescription as AgentPromptDescription).id,
            messagesCount: messages.length,
          });
          observer.error(error);
        }
      };
      void processStream();
    });
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
