import { inject, injectable } from "inversify";
import { nanoid } from "nanoid";
import { BehaviorSubject, Observable } from "rxjs";
import { DataSource, Repository } from "typeorm";
import { Worker } from "worker_threads";
import type {
  AgentDefinition,
  AttachmentRef,
  ChatMessage,
  ConversationMeta,
} from "@memeloop/protocol";
import {
  createMemeLoopRuntime,
  createTaskAgent,
  type AgentFrameworkContext as MemeLoopAgentFrameworkContext,
  type IAgentStorage,
  type ILLMProvider,
  type IToolRegistry,
  type MemeLoopRuntime,
} from "memeloop";
import { DEFAULT_AGENT_FRAMEWORK_ID } from "./defaultAgentFrameworkId";
import MemeLoopWorkerFactory from "./memeloopWorkerFactory";
import { createWorkerProxy } from "@services/libs/workerAdapter";
import type { MemeLoopWorker } from "./memeloopWorker";

import type { AgentHeartbeatConfig } from "@services/agentDefinition/interface";
import type { IAgentDefinitionService } from "@services/agentDefinition/interface";
import { basicPromptConcatHandler } from "@services/agentInstance/agentFrameworks/taskAgent";
import type {
  AgentFramework,
  AgentFrameworkContext,
} from "@services/agentInstance/agentFrameworks/utilities/type";
import { promptConcatStream } from "@services/agentInstance/promptConcat/promptConcat";
import type { AgentPromptDescription } from "@services/agentInstance/promptConcat/promptConcatSchema";
import { getPromptConcatAgentFrameworkConfigJsonSchema } from "@services/agentInstance/promptConcat/promptConcatSchema/jsonSchema";
import type { PromptConcatStreamState } from "@services/agentInstance/promptConcat/promptConcatTypes";
import {
  createHooksWithPlugins,
  initializePluginSystem,
} from "@services/agentInstance/tools";
import { container } from "@services/container";
import type { IDatabaseService } from "@services/database/interface";
import {
  AgentInstanceEntity,
  AgentInstanceMessageEntity,
} from "@services/database/schema/agent";
import type { IGitService } from "@services/git/interface";
import { logger } from "@services/libs/log";
import serviceIdentifier from "@services/serviceIdentifier";
import type { IWorkspaceService } from "@services/workspaces/interface";
import { isWikiWorkspace } from "@services/workspaces/interface";

import {
  createDebouncedMessageUpdater,
  saveUserMessage as saveUserMessageHelper,
} from "./agentMessagePersistence";
import * as repo from "./agentRepository";
import {
  getActiveHeartbeatEntries,
  startHeartbeat,
  stopHeartbeat,
} from "./heartbeatManager";
import type {
  AgentBackgroundTask,
  AgentInstance,
  AgentInstanceLatestStatus,
  AgentInstanceMessage,
  IAgentInstanceService,
  SetBackgroundAlarmInput,
  SetBackgroundHeartbeatInput,
} from "./interface";
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
} from "./scheduledTaskManager";
import type {
  CreateScheduledTaskInput,
  ScheduledTask,
  UpdateScheduledTaskInput,
} from "./scheduledTaskTypes";
import {
  cancelAlarm,
  getActiveAlarmEntries,
  scheduleAlarmTimer,
} from "./tools/alarmClock";
import { cleanupMCPClient } from "./tools/modelContextProtocol";
import {
  executeWorkerBridgeTool,
  listWorkerBridgeTools,
} from "./tools/workerToolBridge";

@injectable()
export class AgentInstanceService implements IAgentInstanceService {
  @inject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @inject(serviceIdentifier.AgentDefinition)
  private readonly agentDefinitionService!: IAgentDefinitionService;

  private dataSource: DataSource | null = null;
  private agentInstanceRepository: Repository<AgentInstanceEntity> | null =
    null;
  private agentMessageRepository: Repository<AgentInstanceMessageEntity> | null =
    null;
  private scheduledTaskRepositoryReady = false;

  private agentInstanceSubjects: Map<
    string,
    BehaviorSubject<AgentInstance | undefined>
  > = new Map();
  private statusSubjects: Map<
    string,
    BehaviorSubject<AgentInstanceLatestStatus | undefined>
  > = new Map();

  private agentFrameworks: Map<string, AgentFramework> = new Map();
  private frameworkSchemas: Map<string, Record<string, unknown>> = new Map();
  private cancelTokenMap: Map<string, { value: boolean }> = new Map();
  private debouncedUpdateFunctions: Map<
    string,
    (
      message: AgentInstanceLatestStatus["message"] & { id: string },
      agentId?: string,
    ) => void
  > = new Map();
  private memeLoopRuntime: MemeLoopRuntime | null = null;
  private memeLoopNativeWorker?: Worker;
  private memeLoopWorker?: MemeLoopWorker;
  private memeLoopWorkerLogCleanup?: () => void;
  private workerAgentIdByConversationId: Map<string, string> = new Map();

  private normalizeMultimodalForModelSupport(
    messages: Array<{ role: "system" | "user" | "assistant"; content: any }>,
  ): Array<{
    role: "system" | "user" | "assistant";
    content: any;
  }> {
    // In test runs we use a mock provider that doesn't implement vision.
    if (process.env.NODE_ENV !== "test") return messages;
    return messages.map((msg) => {
      const c = msg.content;
      if (!Array.isArray(c)) return msg;
      const textParts = c
        .map((part) => {
          if (typeof part === "string") return part;
          if (
            part &&
            typeof part === "object" &&
            (part as any).type === "text"
          ) {
            return String((part as any).text ?? "");
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
      return {
        ...msg,
        content: textParts || "[non-text attachment omitted for current model]",
      };
    });
  }

  private extractToolStepText(data: unknown): string {
    if (typeof data === "string") return data;
    if (data == null) return "";
    if (typeof data !== "object") return String(data);
    const anyData = data as Record<string, unknown>;
    if (typeof anyData.error === "string" && anyData.error.length > 0)
      return anyData.error;
    if (typeof anyData.result === "string" && anyData.result.length > 0)
      return anyData.result;
    if (typeof anyData.message === "string" && anyData.message.length > 0)
      return anyData.message;
    if (typeof anyData.summary === "string" && anyData.summary.length > 0)
      return anyData.summary;
    return JSON.stringify(data ?? "");
  }
  private workerConversationByAgentId: Map<string, string> = new Map();
  private workerConversationCleanupByAgentId: Map<string, () => void> =
    new Map();

  /** Serializes worker ping/restart so concurrent agent turns do not double-terminate or race proxies. */
  private memeLoopWorkerMutex: Promise<void> = Promise.resolve();

  public async initialize(): Promise<void> {
    try {
      await this.initializeDatabase();
      await this.initializeFrameworks();
      // Restore legacy heartbeat timers and alarms for active agents after DB + frameworks are ready
      await this.restoreBackgroundTasks();
      // Restore unified ScheduledTaskManager tasks
      await this.restoreScheduledTaskManagerTasks();
    } catch (error) {
      logger.error("Failed to initialize agent instance service", { error });
      throw error;
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // Database is already initialized in the agent definition service
      this.dataSource = await this.databaseService.getDatabase("agent");
      this.agentInstanceRepository =
        this.dataSource.getRepository(AgentInstanceEntity);
      this.agentMessageRepository = this.dataSource.getRepository(
        AgentInstanceMessageEntity,
      );

      // Initialize the unified ScheduledTaskManager
      const { ScheduledTaskEntity } =
        await import("@services/database/schema/agent");
      const stmRepo = this.dataSource.getRepository(ScheduledTaskEntity);
      initScheduledTaskManager(stmRepo, this);
      this.scheduledTaskRepositoryReady = true;

      logger.debug("AgentInstance repositories initialized");
    } catch (error) {
      logger.error("Failed to initialize agent instance database", { error });
      throw error;
    }
  }

  public async initializeFrameworks(): Promise<void> {
    try {
      // Register tools to global registry once during initialization
      await initializePluginSystem();
      logger.debug(
        "AgentInstance Tool system initialized and tools registered to global registry",
      );

      // Register built-in frameworks
      this.registerBuiltinFrameworks();
      this.initializeMemeLoopRuntimeBridge();
      await this.ensureMemeLoopWorkerHealthy();
      logger.debug("AgentInstance frameworks registered");
    } catch (error) {
      logger.error("Failed to initialize agent instance frameworks", { error });
      throw error;
    }
  }

  public registerBuiltinFrameworks(): void {
    // Tools are already registered in initialize(), so we only register frameworks here
    // Register basic prompt concatenation framework with its schema
    this.registerFramework(
      "basicPromptConcatHandler",
      basicPromptConcatHandler,
      getPromptConcatAgentFrameworkConfigJsonSchema(),
    );
    // MemeLoop worker framework: run the agent loop in `memeloopWorker.ts` and wait for ask/approval events.
    this.registerFramework(
      "memeloopTaskAgentWorker",
      this.memeloopTaskAgentWorkerHandler.bind(this),
      getPromptConcatAgentFrameworkConfigJsonSchema(),
    );
  }

  /**
   * MemeLoop worker framework handler.
   * - Sends the last user message to worker conversation.
   * - Waits until the agent reaches a terminal state or pauses for ask-question/tool-approval.
   * - Streaming step updates are handled by `bindWorkerConversation`.
   */
  private async *memeloopTaskAgentWorkerHandler(
    frameworkContext: AgentFrameworkContext,
  ): AsyncGenerator<
    AgentInstanceLatestStatus,
    AgentInstance | undefined | void,
    unknown
  > {
    try {
      await this.ensureMemeLoopWorkerHealthy();
    } catch (error) {
      logger.error("MemeLoop worker unavailable for memeloopTaskAgentWorker", {
        error,
      });
      yield { state: "failed" };
      return;
    }
    const worker = this.memeLoopWorker;
    if (!worker) {
      yield { state: "failed" };
      return;
    }

    const agentId = frameworkContext.agent.id;
    const definitionId = frameworkContext.agentDef.id;

    const lastUserMessage =
      frameworkContext.agent.messages[
        frameworkContext.agent.messages.length - 1
      ];
    if (!lastUserMessage || lastUserMessage.role !== "user") {
      yield { state: "failed" };
      return;
    }

    const workerConversationId = await this.ensureWorkerConversation(
      agentId,
      definitionId,
    );
    if (!workerConversationId) {
      yield { state: "failed" };
      return;
    }

    const terminalStatePromise = new Promise<
      AgentInstanceLatestStatus["state"]
    >((resolve) => {
      const subscription = worker
        .subscribeToUpdates(workerConversationId)
        .subscribe({
          next: (payload: unknown) => {
            const raw = payload as {
              update?: { type?: string; error?: string };
            };
            const updateType = raw?.update?.type;
            if (!updateType) return;

            if (updateType === "agent-done") {
              subscription.unsubscribe();
              resolve("completed");
              return;
            }
            if (updateType === "agent-error") {
              subscription.unsubscribe();
              resolve("failed");
              return;
            }
            if (updateType === "cancelled") {
              subscription.unsubscribe();
              resolve("canceled");
              return;
            }
            if (
              updateType === "ask-question" ||
              updateType === "tool-approval"
            ) {
              subscription.unsubscribe();
              resolve("input-required");
              return;
            }
          },
        });

      void subscription;
    });

    logger.warn("MemeLoop worker sendMessage start", {
      agentId,
      workerConversationId,
    });
    await worker.sendMessage(workerConversationId, lastUserMessage.content);
    logger.warn("MemeLoop worker sendMessage returned", {
      agentId,
      workerConversationId,
    });
    const terminalState = await terminalStatePromise;
    logger.warn("MemeLoop worker terminal state resolved", {
      agentId,
      workerConversationId,
      terminalState,
    });

    // Do not attach message artifacts here: worker-side `bindWorkerConversation` already updates messages/status.
    yield { state: terminalState };
  }

  /**
   * Phase 1 bridge: instantiate MemeLoopRuntime with Desktop-backed adapters.
   * This keeps current execution pipeline unchanged while preparing runtime migration.
   */
  private initializeMemeLoopRuntimeBridge(): void {
    if (!this.agentInstanceRepository || !this.agentMessageRepository) {
      logger.warn("Skip MemeLoopRuntime bridge init: repositories not ready");
      return;
    }
    if (this.memeLoopRuntime) return;

    const toProtocolRole = (
      role: AgentInstanceMessage["role"],
    ): ChatMessage["role"] => {
      if (role === "assistant" || role === "tool" || role === "user")
        return role;
      return "assistant";
    };

    const storage: IAgentStorage = {
      listConversations: async () => {
        const rows = await this.agentInstanceRepository!.find({
          order: { modified: "DESC" },
          take: 200,
        });
        return rows.map(
          (row): ConversationMeta => ({
            conversationId: row.id,
            title: row.name || row.agentDefId,
            lastMessagePreview: row.status?.message?.content || "",
            lastMessageTimestamp:
              row.modified?.getTime() ?? row.created.getTime(),
            messageCount: 0,
            originNodeId: "desktop",
            definitionId: row.agentDefId,
            isUserInitiated: true,
          }),
        );
      },
      getMessages: async (conversationId: string) => {
        const rows = await this.agentMessageRepository!.find({
          where: { agentId: conversationId },
          order: { created: "ASC" },
        });
        return rows.map(
          (row): ChatMessage => ({
            messageId: row.id,
            conversationId: row.agentId,
            originNodeId: "desktop",
            timestamp: row.modified?.getTime() ?? row.created.getTime(),
            lamportClock: 1,
            role: toProtocolRole(row.role),
            content: row.content,
          }),
        );
      },
      appendMessage: async (message: ChatMessage) => {
        const entity = this.agentMessageRepository!.create({
          id: message.messageId || nanoid(),
          agentId: message.conversationId,
          role: message.role === "assistant" ? "assistant" : message.role,
          content: message.content,
          contentType: "text/plain",
        });
        await this.agentMessageRepository!.save(entity);
      },
      upsertConversationMetadata: async (meta: ConversationMeta) => {
        const existing = await this.agentInstanceRepository!.findOne({
          where: { id: meta.conversationId },
        });
        if (existing) {
          existing.name = meta.title || existing.name;
          await this.agentInstanceRepository!.save(existing);
          return;
        }
        const created = this.agentInstanceRepository!.create({
          id: meta.conversationId,
          agentDefId: meta.definitionId || "default",
          name: meta.title || meta.definitionId || "MemeLoop Agent",
          status: {
            state: "submitted",
            modified: new Date(meta.lastMessageTimestamp),
          },
          created: new Date(meta.lastMessageTimestamp),
          modified: new Date(meta.lastMessageTimestamp),
        });
        await this.agentInstanceRepository!.save(created);
      },
      insertMessagesIfAbsent: async (messages) => {
        for (const msg of messages) {
          const exists = await this.agentMessageRepository!.findOne({
            where: { id: msg.messageId },
          });
          if (!exists) {
            const entity = this.agentMessageRepository!.create({
              id: msg.messageId,
              agentId: msg.conversationId,
              role: msg.role === "assistant" ? "assistant" : msg.role,
              content: msg.content,
              contentType: "text/plain",
            });
            await this.agentMessageRepository!.save(entity);
          }
        }
      },
      getAttachment: async (
        _contentHash: string,
      ): Promise<AttachmentRef | null> => null,
      saveAttachment: async (
        _ref: AttachmentRef,
        _data: Buffer | Uint8Array,
      ): Promise<void> => undefined,
      getAgentDefinition: async (
        id: string,
      ): Promise<AgentDefinition | null> => {
        const def = await this.agentDefinitionService.getAgentDef(id);
        return (def as unknown as AgentDefinition) ?? null;
      },
      saveAgentInstance: async () => undefined,
      getConversationMeta: async (
        conversationId: string,
      ): Promise<ConversationMeta | null> => {
        const row = await this.agentInstanceRepository!.findOne({
          where: { id: conversationId },
        });
        if (!row) return null;
        return {
          conversationId: row.id,
          title: row.name || row.agentDefId,
          lastMessagePreview: row.status?.message?.content || "",
          lastMessageTimestamp:
            row.modified?.getTime() ?? row.created.getTime(),
          messageCount: 0,
          originNodeId: "desktop",
          definitionId: row.agentDefId,
          isUserInitiated: true,
        };
      },
    };

    const tools = new Map<string, unknown>();
    const toolRegistry: IToolRegistry = {
      registerTool: (id, impl) => {
        tools.set(id, impl);
      },
      getTool: (id) => tools.get(id),
      listTools: () => Array.from(tools.keys()),
    };

    const llmProvider: ILLMProvider = {
      name: "tidgi-desktop-bridge",
      chat: async function* (request: unknown) {
        const req = request as {
          messages?: Array<{
            role: "system" | "user" | "assistant" | "tool";
            content: unknown;
          }>;
          conversationId?: string;
        };
        const providerRegistryService = container.get(
          serviceIdentifier.ProviderRegistry,
        ) as any;
        const aiConfig = await providerRegistryService.getAIConfig();
        const messages = (req.messages ?? []).map((message) => ({
          role: message.role,
          content:
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content ?? ""),
        }));
        const generator = await providerRegistryService.generateFromAI(
          messages,
          aiConfig,
          { agentInstanceId: req.conversationId },
        );
        for await (const event of generator as AsyncIterable<any>) {
          if (event?.status === "update" || event?.status === "done") {
            yield event.content;
          }
        }
      },
    };

    const runtimeContext: MemeLoopAgentFrameworkContext = {
      storage,
      tools: toolRegistry,
      llmProvider,
      syncAdapters: [],
      network: {
        start: async () => undefined,
        stop: async () => undefined,
      },
    };
    runtimeContext.runTaskAgent = createTaskAgent(runtimeContext);
    this.memeLoopRuntime = createMemeLoopRuntime(runtimeContext);

    logger.info("MemeLoopRuntime bridge initialized in AgentInstanceService");
  }

  private async initializeMemeLoopWorker(): Promise<void> {
    if (this.memeLoopWorker) return;
    try {
      const worker = (MemeLoopWorkerFactory as () => Worker)();
      worker.on("message", (message: unknown) => {
        const m = message as {
          type?: string;
          id?: string;
          request?: unknown;
          toolId?: string;
          args?: Record<string, unknown>;
        };

        if (m?.type === "memeloop-tool-list" && m.id) {
          worker.postMessage({
            type: "memeloop-tool-list-result",
            id: m.id,
            tools: listWorkerBridgeTools(),
          });
          return;
        }

        if (m?.type === "memeloop-tool-call" && m.id && m.toolId) {
          void (async () => {
            try {
              const result = await executeWorkerBridgeTool(
                m.toolId!,
                m.args ?? {},
              );
              worker.postMessage({
                type: "memeloop-tool-call-result",
                id: m.id,
                result,
              });
            } catch (error) {
              worker.postMessage({
                type: "memeloop-tool-call-error",
                id: m.id,
                error: {
                  message: (error as any)?.message ?? String(error),
                  name: (error as any)?.name ?? "Error",
                  stack: (error as any)?.stack,
                },
              });
            }
          })();
          return;
        }

        if (m?.type === "memeloop-llm-chat" && m.id) {
          void (async () => {
            try {
              const req = m.request as {
                conversationId?: string;
                messages?: Array<{
                  role: "system" | "user" | "assistant" | "tool";
                  content: string;
                }>;
              };

              const conversationId = req.conversationId;
              const mappedAgentId = conversationId
                ? this.workerAgentIdByConversationId.get(conversationId)
                : undefined;
              let modelMessages: Array<{
                role: "system" | "user" | "assistant";
                content: any;
              }>;
              if (
                mappedAgentId &&
                this.agentInstanceRepository &&
                this.agentMessageRepository
              ) {
                const agentRow = await this.agentInstanceRepository.findOne({
                  where: { id: mappedAgentId },
                });
                const def = await this.agentDefinitionService.getAgentDef(
                  agentRow?.agentDefId ?? "task-agent",
                );
                if (!def) {
                  throw new Error(
                    `Agent definition not found: ${agentRow?.agentDefId ?? "task-agent"}`,
                  );
                }
                const rows = await this.agentMessageRepository.find({
                  where: { agentId: mappedAgentId },
                  order: { created: "ASC" },
                });
                const historyMessages = rows.map((row): any => ({
                  id: row.id,
                  agentId: row.agentId,
                  role: row.role,
                  content: row.content,
                  metadata: row.metadata ?? undefined,
                  created: row.created,
                  modified: row.modified ?? row.created,
                }));
                const { promptConcat } =
                  await import("./promptConcat/promptConcat");
                const frameworkContext: any = {
                  agent: {
                    id: mappedAgentId,
                    messages: historyMessages,
                    agentDefId: agentRow?.agentDefId ?? "task-agent",
                    status: { state: "working", modified: new Date() },
                    created: agentRow?.created ?? new Date(),
                    agentFrameworkConfig: agentRow?.agentFrameworkConfig ?? {},
                  },
                  agentDef: {
                    id: def.id,
                    name: def.name,
                    agentFrameworkConfig: def.agentFrameworkConfig ?? {},
                  },
                  isCancelled: () => false,
                };
                const concatResult = await promptConcat(
                  {
                    agentFrameworkConfig: def.agentFrameworkConfig ?? {},
                  } as Pick<AgentPromptDescription, "agentFrameworkConfig">,
                  historyMessages,
                  frameworkContext,
                );
                modelMessages = (concatResult.flatPrompts as any[]).map(
                  (m_) => ({
                    role: (m_.role === "tool" ? "assistant" : m_.role) as
                      | "system"
                      | "user"
                      | "assistant",
                    content: m_.content,
                  }),
                );
              } else {
                modelMessages = (req.messages ?? []).map((msg) => ({
                  role: (msg.role === "tool" ? "assistant" : msg.role) as
                    | "system"
                    | "user"
                    | "assistant",
                  content: msg.content,
                }));
              }

              const providerRegistryService = container.get(
                serviceIdentifier.ProviderRegistry,
              ) as any;
              const aiConfig = await providerRegistryService.getAIConfig();
              logger.warn("memeloop-llm-chat request prepared", {
                conversationId,
                agentId: mappedAgentId,
                messageCount: modelMessages.length,
                hasNonStringContent: modelMessages.some(
                  (msg) => typeof msg.content !== "string",
                ),
              });
              const generator = await providerRegistryService.generateFromAI(
                this.normalizeMultimodalForModelSupport(modelMessages),
                aiConfig,
                {
                  agentInstanceId: conversationId,
                },
              );
              let previousSnapshot = "";
              for await (const event of generator as AsyncIterable<any>) {
                logger.warn("memeloop-llm-chat event", {
                  conversationId,
                  status: event?.status,
                  hasContent:
                    event?.content !== undefined && event?.content !== null,
                  contentType: typeof event?.content,
                  contentPreview:
                    typeof event?.content === "string"
                      ? String(event.content).slice(0, 120)
                      : undefined,
                });
                if (event?.status === "error") {
                  const msg = String(event?.content ?? "AI provider error");
                  throw new Error(msg);
                }
                if (event?.status === "update" || event?.status === "done") {
                  if (event?.content !== undefined && event?.content !== null) {
                    const snapshot = String(event.content);
                    const delta = snapshot.startsWith(previousSnapshot)
                      ? snapshot.slice(previousSnapshot.length)
                      : snapshot;
                    previousSnapshot = snapshot;
                    if (delta)
                      worker.postMessage({
                        type: "memeloop-llm-chat-delta",
                        id: m.id,
                        delta,
                      });
                  }
                }
              }
              worker.postMessage({ type: "memeloop-llm-chat-done", id: m.id });
            } catch (error) {
              worker.postMessage({
                type: "memeloop-llm-chat-error",
                id: m.id,
                error: {
                  message: (error as any)?.message ?? String(error),
                  name: (error as any)?.name ?? "Error",
                  stack: (error as any)?.stack,
                },
              });
            }
          })();
          return;
        }
      });
      worker.on("error", (error) => {
        logger.error("MemeLoop native worker thread error", { error });
      });
      worker.on("exit", (code) => {
        logger.warn("MemeLoop native worker thread exited", { code });
      });
      this.memeLoopNativeWorker = worker;
      this.memeLoopWorker = createWorkerProxy<MemeLoopWorker>(worker);

      // Subscribe worker logs via the standard workerAdapter streaming protocol.
      this.memeLoopWorkerLogCleanup?.();
      try {
        const sub = (this.memeLoopWorker as any).subscribeLogs?.().subscribe({
          next: (evt: unknown) => {
            const e = evt as {
              level?: string;
              message?: string;
              meta?: unknown;
            };
            const level = e.level ?? "info";
            const text = e.message ?? "[memeloop-worker]";
            const meta = e.meta;
            if (level === "warn") logger.warn(text, meta as any);
            else if (level === "error") logger.error(text, meta as any);
            else if (level === "debug") logger.debug(text, meta as any);
            else logger.info(text, meta as any);
          },
          error: (error: unknown) => {
            logger.error("MemeLoop worker log stream failed", { error });
          },
        });
        this.memeLoopWorkerLogCleanup = () => sub.unsubscribe();
      } catch (error) {
        logger.warn("Failed to subscribe MemeLoop worker logs", { error });
      }

      const ping = await Promise.race([
        this.memeLoopWorker.ping(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("MemeLoop worker initial ping timeout")),
            8000,
          );
        }),
      ]);
      logger.info("MemeLoop worker initialized", ping);
    } catch (error) {
      logger.error("Failed to initialize MemeLoop worker", { error });
      throw error;
    }
  }

  /**
   * Ensures the worker thread exists and responds to ping; on failure disposes and recreates it.
   * Caller should treat this as required before any `memeLoopWorker` RPC (serialized via mutex).
   */
  private async ensureMemeLoopWorkerHealthy(): Promise<void> {
    const previous = this.memeLoopWorkerMutex;
    let release!: () => void;
    this.memeLoopWorkerMutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (!this.memeLoopWorker) {
        await this.initializeMemeLoopWorker();
        return;
      }
      try {
        await Promise.race([
          this.memeLoopWorker.ping(),
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("MemeLoop worker ping timeout")),
              5000,
            );
          }),
        ]);
      } catch (error: unknown) {
        logger.warn("MemeLoop worker unhealthy; restarting worker thread", {
          error,
        });
        await this.disposeMemeLoopWorker();
        await this.initializeMemeLoopWorker();
      }
    } finally {
      release();
    }
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
        relations: ["agentDefinition"],
      });

      let heartbeatsRestored = 0;
      let alarmsRestored = 0;

      for (const instance of activeInstances) {
        // Restore heartbeat from definition
        const heartbeatConfig = instance.agentDefinition?.heartbeat;
        if (heartbeatConfig?.enabled) {
          startHeartbeat(instance.id, heartbeatConfig, this, {
            createdBy: "agent-definition",
          });
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
            scheduleAlarmTimer(
              instance.id,
              alarm.wakeAtISO,
              alarm.reminderMessage,
              alarm.repeatIntervalMinutes,
              {
                createdBy: alarm.createdBy ?? "restore",
                runCount: alarm.runCount,
                lastRunAtISO: alarm.lastRunAtISO,
              },
            );
            alarmsRestored++;
          } else {
            // Past one-shot alarm — fire it now and clear
            scheduleAlarmTimer(
              instance.id,
              new Date().toISOString(),
              alarm.reminderMessage,
              undefined,
              {
                createdBy: alarm.createdBy ?? "restore",
                runCount: alarm.runCount,
                lastRunAtISO: alarm.lastRunAtISO,
              },
            );
            alarmsRestored++;
          }
        }
      }

      if (heartbeatsRestored > 0 || alarmsRestored > 0) {
        logger.info("Background tasks restored", {
          heartbeatsRestored,
          alarmsRestored,
          totalInstances: activeInstances.length,
        });
      }
    } catch (error) {
      logger.error("Failed to restore background tasks", { error });
    }
  }

  /**
   * Restore unified ScheduledTaskManager tasks from DB after app restart.
   */
  private async restoreScheduledTaskManagerTasks(): Promise<void> {
    if (!this.scheduledTaskRepositoryReady || !this.agentInstanceRepository)
      return;
    try {
      const { ScheduledTaskEntity } =
        await import("@services/database/schema/agent");
      const stmRepo = this.dataSource!.getRepository(ScheduledTaskEntity);

      const isVolatile = async (agentInstanceId: string): Promise<boolean> => {
        const entity = await this.agentInstanceRepository!.findOne({
          where: { id: agentInstanceId },
        });
        return entity?.volatile ?? true;
      };

      await restoreScheduledTasks(stmRepo, isVolatile);
    } catch (error) {
      logger.error("Failed to restore ScheduledTaskManager tasks", { error });
    }
  }

  /**
   * Register a framework with an optional schema
   * @param frameworkId ID for the framework
   * @param framework The framework function
   * @param schema Optional JSON schema for the framework configuration
   */
  private registerFramework(
    frameworkId: string,
    framework: AgentFramework,
    schema?: Record<string, unknown>,
  ): void {
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
      throw new Error("Agent instance repositories not initialized");
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

    // Cancel and remove all debounced update functions for this agent
    for (const [
      key,
      debouncedFunction,
    ] of this.debouncedUpdateFunctions.entries()) {
      if (key.startsWith(`${agentId}:`)) {
        // Cancel pending writes — agent is being deleted/closed so data would be stale
        (debouncedFunction as unknown as { cancel?: () => void }).cancel?.();
        this.debouncedUpdateFunctions.delete(key);
      }
    }
  }

  public async createAgent(
    agentDefinitionID?: string,
    options?: { preview?: boolean; volatile?: boolean },
  ): Promise<AgentInstance> {
    this.ensureRepositories();
    try {
      const created = await repo.createAgent(
        this.agentInstanceRepository!,
        this.agentDefinitionService,
        agentDefinitionID,
        options,
      );
      // Don't block the agent tab creation UI on MemeLoop worker conversation initialization.
      // Worker conversation binding may take time (or fail), but the agent instance can still be created.
      void this.ensureWorkerConversation(created.id, created.agentDefId);
      return created;
    } catch (error) {
      logger.error("Failed to create agent instance", { error });
      throw error;
    }
  }

  public async getAgent(agentId: string): Promise<AgentInstance | undefined> {
    this.ensureRepositories();
    try {
      return await repo.getAgent(this.agentInstanceRepository!, agentId);
    } catch (error) {
      logger.error("Failed to get agent instance", { error });
      throw error;
    }
  }

  public async updateAgent(
    agentId: string,
    data: Partial<AgentInstance>,
  ): Promise<AgentInstance> {
    this.ensureRepositories();
    try {
      const updatedAgent = await repo.updateAgent(
        this.agentInstanceRepository!,
        this.agentMessageRepository!,
        agentId,
        data,
      );
      this.notifyAgentUpdate(agentId, updatedAgent);
      return updatedAgent;
    } catch (error) {
      logger.error("Failed to update agent instance", { error });
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
      await this.cancelWorkerConversation(agentId);
      await repo.deleteAgent(
        this.agentInstanceRepository!,
        this.agentMessageRepository!,
        agentId,
      );
      this.cleanupAgentSubscriptions(agentId);
      this.cleanupWorkerConversation(agentId);
      this.workerConversationByAgentId.delete(agentId);
    } catch (error) {
      logger.error("Failed to delete agent instance", { error });
      throw error;
    }
  }

  public async getAgents(
    page: number,
    pageSize: number,
    options?: { closed?: boolean; searchName?: string },
  ): Promise<Omit<AgentInstance, "messages">[]> {
    this.ensureRepositories();
    try {
      return await repo.getAgents(
        this.agentInstanceRepository!,
        page,
        pageSize,
        options,
      );
    } catch (error) {
      logger.error("Failed to get agent instances", { error });
      throw error;
    }
  }

  public async sendMsgToAgent(
    agentId: string,
    content: {
      text: string;
      file?: File;
      wikiTiddlers?: Array<{ workspaceName: string; tiddlerTitle: string }>;
    },
  ): Promise<void> {
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
      const agentDefinition = await this.agentDefinitionService.getAgentDef(
        agentInstance.agentDefId,
      );
      if (!agentDefinition) {
        throw new Error(
          `Agent definition not found: ${agentInstance.agentDefId}`,
        );
      }

      // Get appropriate framework, fall back to the default when older agent definitions lack this field
      const agentFrameworkId =
        agentDefinition.agentFrameworkID ?? DEFAULT_AGENT_FRAMEWORK_ID;
      logger.warn("Agent framework selected for sendMsgToAgent", {
        agentId,
        definitionId: agentDefinition.id,
        agentFrameworkId,
      });
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
            state: "working",
            modified: now,
          },
        },
        agentDef: agentDefinition,
        isCancelled: () => cancelToken.value,
      };

      // Create fresh hooks for this framework execution and register plugins based on frameworkConfig
      const { hooks: frameworkHooks } = await createHooksWithPlugins(
        agentDefinition.agentFrameworkConfig || {},
      );

      // Record HEAD commit hashes for all wiki workspaces before the agent turn starts.
      // This allows rollback by comparing with commits made during the turn.
      const beforeCommitMap: Record<
        string,
        { wikiFolderLocation: string; commitHash: string }
      > = {};
      try {
        const workspaceService = container.get<IWorkspaceService>(
          serviceIdentifier.Workspace,
        );
        const gitService = container.get<IGitService>(serviceIdentifier.Git);
        const workspaces = await workspaceService.getWorkspacesAsList();
        for (const ws of workspaces) {
          if (isWikiWorkspace(ws)) {
            try {
              const hash = await gitService.callGitOp(
                "getHeadCommitHash",
                ws.wikiFolderLocation,
              );
              beforeCommitMap[ws.id] = {
                wikiFolderLocation: ws.wikiFolderLocation,
                commitHash: hash,
              };
            } catch {
              // Workspace may not have git initialized — skip silently
            }
          }
        }
        logger.debug("Recorded before-turn commit hashes", {
          agentId,
          workspaceCount: Object.keys(beforeCommitMap).length,
        });
      } catch (error) {
        logger.warn("Failed to record before-turn commit hashes", { error });
      }

      // Trigger userMessageReceived hook with the configured tools
      logger.warn("sendMsgToAgent before userMessageReceived hook", {
        agentId,
        messageId,
      });
      await frameworkHooks.userMessageReceived.promise({
        agentFrameworkContext: frameworkContext,
        content,
        messageId,
        timestamp: now,
      });
      logger.warn("sendMsgToAgent after userMessageReceived hook", {
        agentId,
        messageId,
      });

      // Attach beforeCommitMap to the user message metadata after it's created by the messagePersistence hook.
      // This allows the frontend to know which commit hash to rollback to for this turn.
      if (Object.keys(beforeCommitMap).length > 0) {
        const userMessage = frameworkContext.agent.messages.find(
          (m) => m.id === messageId,
        );
        if (userMessage) {
          userMessage.metadata = { ...userMessage.metadata, beforeCommitMap };
          // Persist the updated metadata
          void this.saveUserMessage(userMessage).catch((error: unknown) => {
            logger.warn("Failed to persist beforeCommitMap metadata", {
              error,
              messageId,
            });
          });
        }
      }

      // Notify agent update after user message is added
      this.notifyAgentUpdate(agentId, frameworkContext.agent);

      try {
        // Create async generator
        logger.warn("sendMsgToAgent before framework generator", {
          agentId,
          agentFrameworkId,
        });
        const generator = framework(frameworkContext);
        logger.warn("sendMsgToAgent framework generator created", {
          agentId,
          agentFrameworkId,
        });

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
            const finalState = lastResult.state ?? "completed";
            logger.debug(`[${agentId}] Completing message stream`, {
              messageId: lastResult.message.id,
              finalState,
            });
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
                logger.debug(`[${agentId}] Subject completed and deleted`, {
                  messageId: lastResult.message?.id,
                });
              } catch (error) {
                logger.error(`[${agentId}] Error completing subject`, {
                  messageId: lastResult.message?.id,
                  error,
                });
              }
            });
          }
        }

        if (lastResult) {
          // Trigger agentStatusChanged hook with actual terminal state (completed, input-required, etc.).
          // This must run even when the framework yields no message (e.g. memeloopTaskAgentWorkerHandler
          // yields { state } without a message; worker-side updates handle message materialization).
          const terminalState = (lastResult.state ?? "completed") as
            | "working"
            | "completed"
            | "failed"
            | "canceled"
            | "input-required";
          await frameworkHooks.agentStatusChanged.promise({
            agentFrameworkContext: frameworkContext,
            status: {
              state: terminalState,
              modified: new Date(),
            },
          });

          // Start heartbeat timer if the agent definition has heartbeat config
          if (agentDefinition.heartbeat?.enabled && !agentInstance.volatile) {
            startHeartbeat(agentId, agentDefinition.heartbeat, this, {
              createdBy: "agent-definition",
            });
          }
        }

        // Remove cancel token after generator completes
        this.cancelTokenMap.delete(agentId);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(`Agent handler execution failed: ${errorMessage}`);

        // Clear any pending message subscriptions for this agent
        for (const key of Array.from(this.statusSubjects.keys())) {
          if (key.startsWith(`${agentId}:`)) {
            const subject = this.statusSubjects.get(key);
            if (subject) {
              try {
                subject.next({
                  state: "failed",
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
        await frameworkHooks.agentStatusChanged
          .promise({
            agentFrameworkContext: frameworkContext,
            status: {
              state: "failed",
              modified: new Date(),
            },
          })
          .catch(() => {
            // Ignore hook errors during error handling
          });

        // Remove cancel token
        this.cancelTokenMap.delete(agentId);
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send message to agent: ${errorMessage}`);
      throw error;
    }
  }

  public async cancelAgent(agentId: string): Promise<void> {
    // Stop heartbeat on cancel
    stopHeartbeat(agentId);

    // Cancel any pending ask-question promises so the agent loop can exit
    try {
      const { cancelPendingQuestions } =
        await import("./tools/askQuestionPending");
      cancelPendingQuestions(agentId);
    } catch {
      // ignore if module not loaded
    }

    // Try to get cancel token
    const cancelToken = this.cancelTokenMap.get(agentId);
    const workerConversationId = this.workerConversationByAgentId.get(agentId);
    if (workerConversationId) {
      void this.ensureMemeLoopWorkerHealthy()
        .then(() => {
          if (!this.memeLoopWorker) return;
          return this.memeLoopWorker.cancelAgent(workerConversationId);
        })
        .catch((error: unknown) => {
          logger.warn("MemeLoop worker cancelAgent failed (non-blocking)", {
            agentId,
            error,
          });
        });
    }

    if (cancelToken) {
      // Set cancel flag
      cancelToken.value = true;

      try {
        // Update agent status to canceled
        logger.debug(
          `cancelAgent called for ${agentId} - updating agent status to canceled`,
        );
        await this.updateAgent(agentId, {
          status: {
            state: "canceled",
            modified: new Date(),
          },
        });
        logger.debug(`updateAgent returned for cancelAgent ${agentId}`);

        // Propagate canceled status to any message-specific subscriptions so UI can react
        try {
          logger.debug(
            "propagating canceled status to message-specific subscriptions",
            { function: "cancelAgent", agentId },
          );
          const agent = await this.getAgent(agentId);
          if (agent && agent.messages) {
            for (const key of Array.from(this.statusSubjects.keys())) {
              if (key.startsWith(`${agentId}:`)) {
                const parts = key.split(":");
                const messageId = parts[1];
                const subject = this.statusSubjects.get(key);
                const message = agent.messages.find((m) => m.id === messageId);
                if (subject) {
                  try {
                    const message_ = message || ({} as AgentInstanceMessage);
                    logger.debug("propagate canceled to subscription", {
                      function: "cancelAgent",
                      subscriptionKey: key,
                    });
                    subject.next({
                      state: "canceled",
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
          logger.warn(
            "Failed to propagate cancel status to message subscriptions",
            { function: "cancelAgent", error },
          );
        }

        // Remove cancel token from map
        this.cancelTokenMap.delete(agentId);

        logger.info("Canceled agent instance", {
          function: "cancelAgent",
          agentId,
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("Failed to cancel agent instance", {
          function: "cancelAgent",
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
      await this.cancelWorkerConversation(agentId);
      this.cleanupWorkerConversation(agentId);
      this.workerConversationByAgentId.delete(agentId);

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

      logger.info("Closed agent instance", {
        function: "closeAgent",
        agentId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Failed to close agent instance", {
        function: "closeAgent",
        error: errorMessage,
      });
      throw error;
    }
  }

  private async ensureWorkerConversation(
    agentId: string,
    definitionId: string,
  ): Promise<string | undefined> {
    try {
      await this.ensureMemeLoopWorkerHealthy();
    } catch (error) {
      logger.error("Failed to ensure MemeLoop worker for conversation", {
        agentId,
        definitionId,
        error,
      });
      return undefined;
    }
    if (!this.memeLoopWorker) return undefined;
    const existing = this.workerConversationByAgentId.get(agentId);
    if (existing) return existing;
    try {
      const created = await this.memeLoopWorker.createAgent(definitionId);
      if (created?.conversationId) {
        this.workerConversationByAgentId.set(agentId, created.conversationId);
        this.bindWorkerConversation(agentId, created.conversationId);
        return created.conversationId;
      }
    } catch (error) {
      logger.error("Failed to create MemeLoop worker conversation", {
        agentId,
        definitionId,
        error,
      });
    }
    return undefined;
  }

  private bindWorkerConversation(
    agentId: string,
    conversationId: string,
  ): void {
    if (!this.memeLoopWorker) return;
    if (this.workerConversationCleanupByAgentId.has(agentId)) return;
    try {
      logger.warn("MemeLoop bindWorkerConversation subscribed", {
        agentId,
        conversationId,
      });
      this.workerAgentIdByConversationId.set(conversationId, agentId);
      // Keep a stable assistant message id while streaming text deltas.
      let assistantMessageId: string | undefined;
      let assistantBuffer = "";
      let lastWasAssistantMessage = false;

      const subscription = this.memeLoopWorker
        .subscribeToUpdates(conversationId)
        .subscribe({
          next: (payload: unknown) => {
            const raw = payload as {
              update?: {
                type?: string;
                // Custom events we emit from worker.
                payload?: unknown;
                error?: string;
                step?: { type?: string; data?: unknown };
              };
            };
            const updateType = raw?.update?.type;
            if (!updateType) return;
            // Debug hook: verify whether MemeLoop emits ask-question/tool-approval updates.
            // Keep this log short to avoid huge log files in e2e.
            logger.warn("MemeLoop worker update received", {
              agentId,
              conversationId,
              updateType,
              hasPayload: Boolean(raw?.update?.payload),
              stepType: raw?.update?.step?.type,
            });

            if (updateType === "ask-question") {
              const payload_ = raw.update?.payload as
                | {
                    type: "ask-question";
                    questionId?: string;
                    question: string;
                    inputType?: "single-select" | "multi-select" | "text";
                    options?: Array<{ label: string; description?: string }>;
                    allowFreeform?: boolean;
                  }
                | undefined;
              if (!payload_?.question) return;

              const questionId = payload_.questionId ?? `unknown-${Date.now()}`;
              const askPrompt = {
                type: "ask-question",
                questionId,
                question: payload_.question,
                inputType: payload_.inputType ?? "text",
                options: payload_.options,
                allowFreeform: payload_.allowFreeform ?? true,
              };

              const content = `<functions_result>
Tool: ask-question
Parameters: {}
Result: ${JSON.stringify(askPrompt)}
</functions_result>`;

              const message = {
                id: `worker-ask-${questionId}`,
                agentId,
                role: "agent" as const,
                content,
                modified: new Date(),
              };

              const statusKey = `${agentId}:${message.id}`;
              void this.updateAgent(agentId, {
                status: {
                  state: "input-required",
                  modified: new Date(),
                },
                messages: [message],
              }).catch(() => undefined);

              if (this.statusSubjects.has(statusKey)) {
                this.statusSubjects.get(statusKey)?.next({
                  state: "input-required",
                  message,
                  modified: new Date(),
                });
              }
              return;
            }

            if (updateType === "tool-approval") {
              const payload_ = raw.update?.payload as
                | {
                    type: "tool-approval";
                    approvalId: string;
                    toolName: string;
                    parameters: Record<string, unknown>;
                  }
                | undefined;
              if (!payload_?.approvalId || !payload_?.toolName) return;

              const approvalPrompt = {
                type: "tool-approval",
                approvalId: payload_.approvalId,
                toolName: payload_.toolName,
                parameters: payload_.parameters ?? {},
              };

              const content = `<functions_result>
Tool: tool-approval
Parameters: {}
Result: ${JSON.stringify(approvalPrompt)}
</functions_result>`;

              const message = {
                id: `worker-approval-${payload_.approvalId}`,
                agentId,
                role: "agent" as const,
                content,
                modified: new Date(),
              };

              const statusKey = `${agentId}:${message.id}`;
              void this.updateAgent(agentId, {
                status: {
                  state: "input-required",
                  modified: new Date(),
                },
                messages: [message],
              }).catch(() => undefined);

              if (this.statusSubjects.has(statusKey)) {
                this.statusSubjects.get(statusKey)?.next({
                  state: "input-required",
                  message,
                  modified: new Date(),
                });
              }
              return;
            }

            if (updateType === "agent-step") {
              const step = raw.update?.step;
              const stepType = step?.type;
              if (!stepType) return;
              if (stepType === "message") {
                const data = step.data as unknown;
                const delta =
                  typeof data === "string"
                    ? data
                    : data &&
                        typeof data === "object" &&
                        "content" in (data as any) &&
                        typeof (data as any).content === "string"
                      ? String((data as any).content)
                      : JSON.stringify(data ?? "");
                logger.warn("MemeLoop worker assistant delta", {
                  agentId,
                  conversationId,
                  deltaPreview: delta.slice(0, 120),
                });
                if (!lastWasAssistantMessage) {
                  assistantMessageId = `worker-assistant-${Date.now()}`;
                  assistantBuffer = delta;
                } else {
                  assistantBuffer += delta;
                }
                lastWasAssistantMessage = true;
                const messageId =
                  assistantMessageId ?? `worker-assistant-${Date.now()}`;
                const message = {
                  id: messageId,
                  agentId,
                  role: "assistant" as const,
                  content: assistantBuffer,
                  modified: new Date(),
                };
                const statusKey = `${agentId}:${message.id}`;
                void this.updateAgent(agentId, {
                  status: {
                    state: "working",
                    modified: new Date(),
                  },
                  messages: [message],
                }).catch(() => undefined);
                if (this.statusSubjects.has(statusKey)) {
                  this.statusSubjects
                    .get(statusKey)
                    ?.next({ state: "working", message, modified: new Date() });
                }
                return;
              }
              if (stepType === "thinking") {
                // Do not materialize hidden "step" messages into the chat history.
                // The UI may still render hidden messages in the DOM, which breaks E2E
                // that expects exactly user+assistant bubbles for a plain-text turn.
                lastWasAssistantMessage = false;
              }
              if (stepType === "tool") {
                lastWasAssistantMessage = false;
                const data = step.data as unknown;
                const content = this.extractToolStepText(data);
                logger.warn("MemeLoop tool step materialized", {
                  agentId,
                  conversationId,
                  contentPreview: content.slice(0, 200),
                });
                const message = {
                  id: `worker-tool-${Date.now()}`,
                  agentId,
                  role: "tool" as const,
                  content,
                  modified: new Date(),
                };
                void this.updateAgent(agentId, {
                  status: { state: "working", modified: new Date() },
                  messages: [message],
                }).catch(() => undefined);
              }
              return;
            }
            if (updateType === "cancelled") {
              const finalMessageId = assistantMessageId;
              const finalContent = assistantBuffer;
              lastWasAssistantMessage = false;
              assistantMessageId = undefined;
              assistantBuffer = "";
              void this.updateAgent(agentId, {
                status: {
                  state: "canceled",
                  modified: new Date(),
                },
              }).catch(() => undefined);
              if (finalMessageId) {
                const message = {
                  id: finalMessageId,
                  agentId,
                  role: "assistant" as const,
                  content: finalContent,
                };
                const statusKey = `${agentId}:${finalMessageId}`;
                if (this.statusSubjects.has(statusKey)) {
                  this.statusSubjects.get(statusKey)?.next({
                    state: "canceled",
                    message,
                    modified: new Date(),
                  });
                }
              }
              return;
            }
            if (updateType === "agent-done") {
              const finalMessageId = assistantMessageId;
              const finalContent = assistantBuffer;
              lastWasAssistantMessage = false;
              assistantMessageId = undefined;
              assistantBuffer = "";
              void this.updateAgent(agentId, {
                status: {
                  state: "completed",
                  modified: new Date(),
                },
              }).catch(() => undefined);
              if (finalMessageId) {
                const message = {
                  id: finalMessageId,
                  agentId,
                  role: "assistant" as const,
                  content: finalContent,
                };
                const statusKey = `${agentId}:${finalMessageId}`;
                if (this.statusSubjects.has(statusKey)) {
                  this.statusSubjects.get(statusKey)?.next({
                    state: "completed",
                    message,
                    modified: new Date(),
                  });
                }
              }
              return;
            }
            if (updateType === "agent-error") {
              lastWasAssistantMessage = false;
              const message = {
                id: `worker-error-${Date.now()}`,
                agentId,
                role: "error" as const,
                content: raw?.update?.error || "MemeLoop worker error",
                modified: new Date(),
              };
              const statusKey = `${agentId}:${message.id}`;
              void this.updateAgent(agentId, {
                status: {
                  state: "failed",
                  modified: new Date(),
                },
                messages: [message],
              }).catch(() => undefined);
              if (this.statusSubjects.has(statusKey)) {
                this.statusSubjects
                  .get(statusKey)
                  ?.next({ state: "failed", message, modified: new Date() });
              }
            }
          },
          error: (error: unknown) => {
            logger.warn("MemeLoop worker update stream failed", {
              agentId,
              conversationId,
              error,
            });
          },
        });
      this.workerConversationCleanupByAgentId.set(agentId, () =>
        subscription.unsubscribe(),
      );
    } catch (error) {
      logger.warn("Failed to bind MemeLoop worker update stream", {
        agentId,
        conversationId,
        error,
      });
    }
  }

  private cleanupWorkerConversation(agentId: string): void {
    const workerConversationId = this.workerConversationByAgentId.get(agentId);
    const cleanup = this.workerConversationCleanupByAgentId.get(agentId);
    if (cleanup) {
      try {
        cleanup();
      } catch {
        // ignore
      }
      this.workerConversationCleanupByAgentId.delete(agentId);
    }
    if (workerConversationId) {
      this.workerAgentIdByConversationId.delete(workerConversationId);
    }
  }

  private async cancelWorkerConversation(agentId: string): Promise<void> {
    const workerConversationId = this.workerConversationByAgentId.get(agentId);
    if (!workerConversationId) return;
    try {
      await this.ensureMemeLoopWorkerHealthy();
    } catch {
      return;
    }
    if (!this.memeLoopWorker) return;
    try {
      await this.memeLoopWorker.cancelAgent(workerConversationId);
    } catch (error) {
      logger.warn(
        "Failed to cancel MemeLoop worker conversation during cleanup",
        { agentId, workerConversationId, error },
      );
    }
  }

  public async resolveToolApproval(
    approvalId: string,
    decision: "allow" | "deny",
  ): Promise<void> {
    try {
      await this.ensureMemeLoopWorkerHealthy();
    } catch {
      // fall through to legacy resolver
    }
    if (this.memeLoopWorker) {
      try {
        await this.memeLoopWorker.resolveToolApproval(approvalId, decision);
        return;
      } catch (error) {
        logger.warn(
          "MemeLoop worker resolveToolApproval failed, fallback to legacy",
          { approvalId, error },
        );
      }
    }

    const { resolveApproval } = await import("./tools/approval");
    resolveApproval(approvalId, decision);
  }

  public resolveAskQuestion(
    agentId: string,
    questionId: string,
    answer: string,
  ): void {
    // Prefer resolving inside MemeLoop worker so the agent can continue in the same turn.
    void (async () => {
      try {
        await this.ensureMemeLoopWorkerHealthy();
      } catch (error) {
        logger.warn(
          "MemeLoop worker unavailable for resolveAskQuestion; using legacy path",
          { agentId, error },
        );
        await this.resolveAskQuestionAsync(agentId, questionId, answer);
        return;
      }
      if (this.memeLoopWorker) {
        try {
          const res = await this.memeLoopWorker.resolveAskQuestion(
            agentId,
            questionId,
            answer,
          );
          if (res?.resolved) return;
        } catch {
          // fall through
        }
      }
      await this.resolveAskQuestionAsync(agentId, questionId, answer);
    })();
  }

  private async resolveAskQuestionAsync(
    agentId: string,
    questionId: string,
    answer: string,
  ): Promise<void> {
    try {
      // Reuse sendMsgToAgent with the answer text.
      // The answer goes in as a user message so the framework can process it normally.
      // The UI will display it as a regular message (not a tool result).
      // This is the simplest approach that works with the existing framework architecture.
      await this.sendMsgToAgent(agentId, { text: answer });
      logger.debug("Ask-question resolved via sendMsgToAgent", {
        questionId,
        agentId,
      });
    } catch (error) {
      logger.error("Failed to resolve ask-question", { questionId, error });
    }
  }

  public async deleteMessages(
    agentId: string,
    messageIds: string[],
  ): Promise<void> {
    if (!this.agentMessageRepository || !this.agentInstanceRepository) {
      throw new Error("Database not initialized");
    }
    if (messageIds.length === 0) return;

    await this.agentMessageRepository.delete(messageIds);

    // Also update the in-memory agent messages list
    const agent = await this.agentInstanceRepository.findOne({
      where: { id: agentId },
      relations: ["messages"],
    });
    if (agent) {
      const deletedSet = new Set(messageIds);
      agent.messages = (agent.messages ?? []).filter(
        (m) => !deletedSet.has(m.id),
      );
      await this.agentInstanceRepository.save(agent);
    }
  }

  public async getTurnChangedFiles(
    agentId: string,
    userMessageId: string,
  ): Promise<Array<{ path: string; status: string }>> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent instance not found: ${agentId}`);
    }

    const userMessage = agent.messages.find((m) => m.id === userMessageId);
    if (!userMessage) {
      throw new Error(`User message not found: ${userMessageId}`);
    }

    const beforeCommitMap = userMessage.metadata?.beforeCommitMap as
      | Record<string, { wikiFolderLocation: string; commitHash: string }>
      | undefined;
    if (!beforeCommitMap || Object.keys(beforeCommitMap).length === 0) {
      return [];
    }

    const allChangedFiles: Array<{ path: string; status: string }> = [];
    const gitService = container.get<IGitService>(serviceIdentifier.Git);

    for (const [
      _workspaceId,
      { wikiFolderLocation, commitHash },
    ] of Object.entries(beforeCommitMap)) {
      try {
        const changedFiles = await gitService.callGitOp(
          "getChangedFilesBetweenCommits",
          wikiFolderLocation,
          commitHash,
        );
        for (const file of changedFiles) {
          allChangedFiles.push({ path: file.path, status: file.status });
        }
      } catch (error) {
        logger.warn("Failed to get changed files for workspace", {
          wikiFolderLocation,
          error,
        });
      }
    }

    return allChangedFiles;
  }

  public async rollbackTurn(
    agentId: string,
    userMessageId: string,
  ): Promise<{ rolledBack: number; errors: string[] }> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent instance not found: ${agentId}`);
    }

    const userMessage = agent.messages.find((m) => m.id === userMessageId);
    if (!userMessage) {
      throw new Error(`User message not found: ${userMessageId}`);
    }

    const beforeCommitMap = userMessage.metadata?.beforeCommitMap as
      | Record<string, { wikiFolderLocation: string; commitHash: string }>
      | undefined;
    if (!beforeCommitMap || Object.keys(beforeCommitMap).length === 0) {
      return {
        rolledBack: 0,
        errors: ["No commit snapshot recorded for this turn"],
      };
    }

    let rolledBack = 0;
    const errors: string[] = [];
    const gitService = container.get<IGitService>(serviceIdentifier.Git);

    for (const [
      _workspaceId,
      { wikiFolderLocation, commitHash },
    ] of Object.entries(beforeCommitMap)) {
      try {
        // Get the list of files that changed since the beforeCommitHash
        const changedFiles = await gitService.callGitOp(
          "getChangedFilesBetweenCommits",
          wikiFolderLocation,
          commitHash,
        );

        if (changedFiles.length === 0) continue;

        // Restore each file to its state at the beforeCommitHash
        for (const file of changedFiles) {
          try {
            await gitService.callGitOp(
              "restoreFileFromCommit",
              wikiFolderLocation,
              commitHash,
              file.path,
            );
            rolledBack++;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            errors.push(`Failed to restore ${file.path}: ${errorMessage}`);
          }
        }

        logger.info("Rolled back files for workspace", {
          wikiFolderLocation,
          fileCount: changedFiles.length,
          rolledBack,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push(
          `Failed to get changed files for ${wikiFolderLocation}: ${errorMessage}`,
        );
      }
    }

    // Mark the turn as rolled back in user message metadata.
    // Note: rollback restores files to working tree + staging area but does NOT create a new commit.
    // The next scheduled commitAndSync will commit the restored state as a new change.
    userMessage.metadata = {
      ...userMessage.metadata,
      rolledBack: true,
      rollbackTimestamp: new Date().toISOString(),
    };
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
      const agentDefinition = agent?.agentDefId
        ? await this.agentDefinitionService.getAgentDef(agent.agentDefId)
        : undefined;
      const heartbeatConfig = agentDefinition?.heartbeat;
      tasks.push({
        agentId,
        agentName: agent?.name ?? agentDefinition?.name,
        type: "heartbeat",
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
        type: "alarm",
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

  public async cancelBackgroundTask(
    agentId: string,
    type: "heartbeat" | "alarm",
  ): Promise<void> {
    if (type === "heartbeat") {
      stopHeartbeat(agentId);
    } else if (type === "alarm") {
      cancelAlarm(agentId);
    }
    logger.info("Background task cancelled from UI", { agentId, type });
  }

  public async setBackgroundAlarm(
    agentId: string,
    alarm: SetBackgroundAlarmInput,
  ): Promise<void> {
    this.ensureRepositories();

    const entity = await this.agentInstanceRepository!.findOne({
      where: { id: agentId },
    });
    if (!entity) {
      throw new Error(`Agent instance not found: ${agentId}`);
    }

    const parsedWakeAt = new Date(alarm.wakeAtISO);
    if (Number.isNaN(parsedWakeAt.getTime())) {
      throw new Error(`Invalid wakeAtISO: ${alarm.wakeAtISO}`);
    }

    const repeatIntervalMinutes =
      alarm.repeatIntervalMinutes && alarm.repeatIntervalMinutes > 0
        ? alarm.repeatIntervalMinutes
        : undefined;
    const wakeAtISO = parsedWakeAt.toISOString();

    scheduleAlarmTimer(
      agentId,
      wakeAtISO,
      alarm.message,
      repeatIntervalMinutes,
      {
        createdBy: "settings-ui",
        runCount: 0,
      },
    );

    await this.agentInstanceRepository!.update(agentId, {
      scheduledAlarm: {
        wakeAtISO,
        reminderMessage: alarm.message,
        repeatIntervalMinutes,
        createdBy: "settings-ui",
        runCount: 0,
      },
    });

    logger.info("Background alarm upserted from UI", {
      agentId,
      wakeAtISO,
      repeatIntervalMinutes,
    });
  }

  public async setBackgroundHeartbeat(
    agentId: string,
    heartbeat: SetBackgroundHeartbeatInput,
  ): Promise<void> {
    this.ensureRepositories();

    const entity = await this.agentInstanceRepository!.findOne({
      where: { id: agentId },
    });
    if (!entity) {
      throw new Error(`Agent instance not found: ${agentId}`);
    }
    if (!entity.agentDefId) {
      throw new Error(`Agent definition not found for instance: ${agentId}`);
    }

    const agentDefinition = await this.agentDefinitionService.getAgentDef(
      entity.agentDefId,
    );
    if (!agentDefinition) {
      throw new Error(`Agent definition not found: ${entity.agentDefId}`);
    }

    const normalizedHeartbeat: AgentHeartbeatConfig = {
      enabled: heartbeat.enabled,
      intervalSeconds: Math.max(
        60,
        Math.round(heartbeat.intervalSeconds || 60),
      ),
      message:
        heartbeat.message?.trim() ||
        "[Heartbeat] Periodic check-in. Review your tasks and take any pending actions.",
      activeHoursStart: heartbeat.activeHoursStart || undefined,
      activeHoursEnd: heartbeat.activeHoursEnd || undefined,
    };

    await this.agentDefinitionService.updateAgentDef({
      id: agentDefinition.id,
      heartbeat: normalizedHeartbeat,
    });

    if (normalizedHeartbeat.enabled && !entity.volatile) {
      startHeartbeat(agentId, normalizedHeartbeat, this, {
        createdBy: "settings-ui",
      });
    } else {
      stopHeartbeat(agentId);
    }

    logger.info("Background heartbeat upserted from UI", {
      agentId,
      enabled: normalizedHeartbeat.enabled,
      intervalSeconds: normalizedHeartbeat.intervalSeconds,
      activeHoursStart: normalizedHeartbeat.activeHoursStart,
      activeHoursEnd: normalizedHeartbeat.activeHoursEnd,
    });
  }

  // ── ScheduledTask CRUD ────────────────────────────────────────────────────

  public async createScheduledTask(
    input: CreateScheduledTaskInput,
  ): Promise<ScheduledTask> {
    return stmAddTask(input);
  }

  public async updateScheduledTask(
    input: UpdateScheduledTaskInput,
  ): Promise<ScheduledTask> {
    return stmUpdateTask(input);
  }

  public async deleteScheduledTask(taskId: string): Promise<void> {
    return stmRemoveTask(taskId);
  }

  public async listScheduledTasks(): Promise<ScheduledTask[]> {
    return stmGetActiveTasks();
  }

  public async listScheduledTasksForAgent(
    agentInstanceId: string,
  ): Promise<ScheduledTask[]> {
    return stmGetActiveTasksForAgent(agentInstanceId);
  }

  public async getCronPreviewDates(
    expression: string,
    timezone?: string,
    count = 3,
  ): Promise<string[]> {
    return stmGetCronPreviewDates(expression, timezone, count);
  }

  public subscribeToAgentUpdates(
    agentId: string,
  ): Observable<AgentInstance | undefined>;
  /**
   * Subscribe to agent instance message status updates
   */
  public subscribeToAgentUpdates(
    agentId: string,
    messageId: string,
  ): Observable<AgentInstanceLatestStatus | undefined>;
  public subscribeToAgentUpdates(
    agentId: string,
    messageId?: string,
  ): Observable<AgentInstance | AgentInstanceLatestStatus | undefined> {
    // If messageId provided, subscribe to specific message status updates
    if (messageId) {
      const statusKey = `${agentId}:${messageId}`;
      if (!this.statusSubjects.has(statusKey)) {
        this.statusSubjects.set(
          statusKey,
          new BehaviorSubject<AgentInstanceLatestStatus | undefined>(undefined),
        );

        // Try to get initial status
        this.getAgent(agentId)
          .then((agent) => {
            if (agent) {
              const message = agent.messages.find((m) => m.id === messageId);
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
          })
          .catch((error: unknown) => {
            logger.error("Failed to get initial status for message", {
              function: "subscribeToAgentUpdates",
              error,
            });
          });
      }

      return this.statusSubjects.get(statusKey)!.asObservable();
    }

    // If no messageId provided, subscribe to entire agent instance updates
    if (!this.agentInstanceSubjects.has(agentId)) {
      this.agentInstanceSubjects.set(
        agentId,
        new BehaviorSubject<AgentInstance | undefined>(undefined),
      );

      // Try to get initial data
      this.getAgent(agentId)
        .then((agent) => {
          this.agentInstanceSubjects.get(agentId)?.next(agent);
        })
        .catch((error: unknown) => {
          logger.error("Failed to get initial agent data", {
            function: "subscribeToAgentUpdates",
            error,
          });
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to notify agent update: ${errorMessage}`);
    }
  }

  public async saveUserMessage(
    userMessage: AgentInstanceMessage,
  ): Promise<void> {
    this.ensureRepositories();
    try {
      await saveUserMessageHelper(this.agentMessageRepository!, userMessage);
    } catch (error) {
      logger.error("Failed to save user message", {
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
    // Use agentId:messageId as key so we can clean up by agentId prefix
    const debounceKey = agentId ? `${agentId}:${messageId}` : messageId;

    // Update status subscribers for specific message if available
    if (agentId) {
      const statusKey = `${agentId}:${messageId}`;
      if (this.statusSubjects.has(statusKey)) {
        this.statusSubjects.get(statusKey)?.next({
          state: "working",
          message,
          modified: message.modified ?? new Date(),
        });
      }
    }

    // Lazy-create debounced function for each message ID
    if (!this.debouncedUpdateFunctions.has(debounceKey)) {
      this.ensureRepositories();
      const debouncedUpdate = createDebouncedMessageUpdater(
        this.dataSource!,
        messageId,
        debounceMs,
        (aid, updatedAgent) => {
          if (this.agentInstanceSubjects.has(aid)) {
            this.agentInstanceSubjects.get(aid)?.next(updatedAgent);
            logger.debug(
              `Notified agent subscribers of new message: ${messageId}`,
              {
                method: "debounceUpdateMessage",
                agentId: aid,
              },
            );
          }
        },
      );
      this.debouncedUpdateFunctions.set(debounceKey, debouncedUpdate);
    }

    const debouncedFunction = this.debouncedUpdateFunctions.get(debounceKey);
    if (debouncedFunction) {
      debouncedFunction(message, agentId);
    }
  }

  public concatPrompt(
    promptDescription: Pick<AgentPromptDescription, "agentFrameworkConfig">,
    messages: AgentInstanceMessage[],
  ): Observable<PromptConcatStreamState> {
    logger.debug("AgentInstanceService.concatPrompt called", {
      hasPromptConfig: !!promptDescription.agentFrameworkConfig,
      promptConfigKeys: Object.keys(
        promptDescription.agentFrameworkConfig || {},
      ),
      messagesCount: messages.length,
    });

    return new Observable<PromptConcatStreamState>((observer) => {
      const processStream = async () => {
        try {
          // Create a minimal framework context for prompt concatenation
          const frameworkContext = {
            agent: {
              id: "temp",
              messages,
              agentDefId: "temp",
              status: { state: "working" as const, modified: new Date() },
              created: new Date(),
              agentFrameworkConfig: {},
            },
            agentDef: {
              id: "temp",
              name: "temp",
              agentFrameworkConfig:
                promptDescription.agentFrameworkConfig || {},
            },
            isCancelled: () => false,
          };

          const streamGenerator = promptConcatStream(
            promptDescription as AgentPromptDescription,
            messages,
            frameworkContext,
          );
          for await (const state of streamGenerator) {
            observer.next(state);
            if (state.isComplete) {
              observer.complete();
              break;
            }
          }
        } catch (error) {
          logger.error("Error in AgentInstanceService.concatPrompt", {
            error,
            promptDescriptionId: (promptDescription as AgentPromptDescription)
              .id,
            messagesCount: messages.length,
          });
          observer.error(error);
        }
      };
      void processStream();
    });
  }

  /**
   * Terminate the MemeLoop worker thread and drop proxies. Call from app `before-quit` so the process can exit cleanly.
   */
  public async disposeMemeLoopWorker(): Promise<void> {
    this.memeLoopWorkerLogCleanup?.();
    this.memeLoopWorkerLogCleanup = undefined;
    for (const [agentId, cleanup] of [
      ...this.workerConversationCleanupByAgentId.entries(),
    ]) {
      try {
        cleanup();
      } catch {
        // ignore
      }
      this.workerConversationCleanupByAgentId.delete(agentId);
    }
    this.workerAgentIdByConversationId.clear();
    this.workerConversationByAgentId.clear();

    if (this.memeLoopNativeWorker) {
      try {
        await this.memeLoopNativeWorker.terminate();
      } catch (error) {
        logger.warn("Failed to terminate MemeLoop native worker", { error });
      }
      this.memeLoopNativeWorker = undefined;
    }
    this.memeLoopWorker = undefined;
  }

  public getFrameworkConfigSchema(
    frameworkId: string,
  ): Record<string, unknown> {
    try {
      logger.debug("AgentInstanceService.getFrameworkConfigSchema called", {
        frameworkId,
      });
      // Check if we have a schema for this framework
      const schema = this.frameworkSchemas.get(frameworkId);
      if (schema) {
        return schema;
      }
      // If no schema found, return an empty schema
      logger.warn(`No schema found for framework: ${frameworkId}`);
      return { type: "object", properties: {} };
    } catch (error) {
      logger.error("Error in AgentInstanceService.getFrameworkConfigSchema", {
        error,
        frameworkId,
      });
      throw error;
    }
  }
}
