import "source-map-support/register";

import { nanoid } from "nanoid";
import { firstValueFrom, Observable, Subject, toArray } from "rxjs";
import path from "node:path";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import type { ITiddlerFields } from "tiddlywiki";
import { isWikiWorkspace } from "@services/workspaces/interface";
import type {
  AgentDefinition,
  AttachmentRef,
  ChatMessage,
  ConversationMeta,
} from "@memeloop/protocol";
import taskAgents from "./agentFrameworks/taskAgents.json";

import {
  resolveApproval,
  resolveQuestionAnswer,
  onApprovalRequest,
} from "memeloop";
import type { IWikiManager, TiddlerFields } from "memeloop-node";
import { handleWorkerMessages } from "@services/libs/workerAdapter";
import {
  agentDefinition as agentDefinitionService,
  externalAPI as providerRegistryService,
  native as nativeService,
  workspace as workspaceService,
} from "@services/wiki/wikiWorker/services";
import { TerminalSessionManager } from "./terminal/sessionManager";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parentPort } =
  require("worker_threads") as typeof import("worker_threads");

type WorkerLogEvent = {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  meta?: unknown;
};

// Use the existing workerAdapter Observable streaming channel for logs,
// so we don't invent a one-off postMessage protocol.
const logSubject = new Subject<WorkerLogEvent>();
function workerLog(
  level: WorkerLogEvent["level"],
  message: string,
  meta?: unknown,
): void {
  try {
    logSubject.next({ level, message, meta });
  } catch {
    // ignore
  }
}

type MainLlmChatRequest = {
  conversationId?: string;
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
  }>;
};

type PendingLlmStream = {
  deltas: string[];
  waiters: Array<(r: IteratorResult<string, undefined>) => void>;
  done: boolean;
  error?: Error;
};
const pendingMainLlmChat = new Map<string, PendingLlmStream>();
type PendingMainRequest<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};
const pendingMainToolList = new Map<string, PendingMainRequest<string[]>>();
const pendingMainToolCall = new Map<string, PendingMainRequest<unknown>>();

if (parentPort) {
  parentPort.on("message", (message: unknown) => {
    const m = message as {
      type?: string;
      id?: string;
      delta?: string;
      tools?: string[];
      result?: unknown;
      error?: { message: string; name?: string; stack?: string };
    };
    if (!m?.id) return;
    if (m.type === "memeloop-tool-list-result") {
      const pending = pendingMainToolList.get(m.id);
      if (!pending) return;
      pendingMainToolList.delete(m.id);
      pending.resolve(
        Array.isArray(m.tools)
          ? m.tools.filter((t): t is string => typeof t === "string")
          : [],
      );
      return;
    }
    if (m.type === "memeloop-tool-call-result") {
      const pending = pendingMainToolCall.get(m.id);
      if (!pending) return;
      pendingMainToolCall.delete(m.id);
      pending.resolve(m.result);
      return;
    }
    if (m.type === "memeloop-tool-call-error") {
      const pending = pendingMainToolCall.get(m.id);
      if (!pending) return;
      pendingMainToolCall.delete(m.id);
      const error = new Error(m.error?.message ?? "memeloop-tool-call failed");
      error.name = m.error?.name ?? "Error";
      error.stack = m.error?.stack;
      pending.reject(error);
      return;
    }

    const pending = pendingMainLlmChat.get(m.id);
    if (!pending) return;
    if (m.type === "memeloop-llm-chat-delta") {
      const delta = String(m.delta ?? "");
      if (!delta) return;
      const waiter = pending.waiters.shift();
      if (waiter) waiter({ value: delta, done: false });
      else pending.deltas.push(delta);
    } else if (m.type === "memeloop-llm-chat-done") {
      pending.done = true;
      while (pending.waiters.length > 0) {
        const waiter = pending.waiters.shift();
        if (waiter) waiter({ value: undefined, done: true });
      }
      pendingMainLlmChat.delete(m.id);
    } else if (m.type === "memeloop-llm-chat-error") {
      const error = new Error(m.error?.message ?? "memeloop-llm-chat failed");
      error.name = m.error?.name ?? "Error";
      error.stack = m.error?.stack;
      pending.error = error;
      while (pending.waiters.length > 0) {
        const waiter = pending.waiters.shift();
        if (waiter) waiter({ value: undefined, done: true });
      }
      pendingMainLlmChat.delete(m.id);
    }
  });
}

function makeMainRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function requestMainBridgeToolList(timeoutMs = 10000): Promise<string[]> {
  const id = makeMainRequestId("tools");
  const result = await new Promise<string[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingMainToolList.delete(id);
      reject(new Error(`memeloop-tool-list timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    pendingMainToolList.set(id, {
      resolve: (tools) => {
        clearTimeout(timeout);
        resolve(tools);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });
    parentPort?.postMessage({ type: "memeloop-tool-list", id });
  });
  return result;
}

async function callMainTool(
  toolId: string,
  args: Record<string, unknown>,
  timeoutMs = 60000,
): Promise<unknown> {
  const id = makeMainRequestId("toolcall");
  const result = await new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingMainToolCall.delete(id);
      reject(
        new Error(
          `memeloop-tool-call timed out after ${timeoutMs}ms for ${toolId}`,
        ),
      );
    }, timeoutMs);
    pendingMainToolCall.set(id, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });
    parentPort?.postMessage({ type: "memeloop-tool-call", id, toolId, args });
  });
  return result;
}

async function* callMainLlmChat(
  request: MainLlmChatRequest,
): AsyncGenerator<string, void, unknown> {
  const id = `llm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const pending: PendingLlmStream = { deltas: [], waiters: [], done: false };
  pendingMainLlmChat.set(id, pending);
  parentPort?.postMessage({ type: "memeloop-llm-chat", id, request });

  while (true) {
    if (pending.error) throw pending.error;
    if (pending.deltas.length > 0) {
      yield pending.deltas.shift()!;
      continue;
    }
    if (pending.done) return;
    const next = await new Promise<IteratorResult<string, undefined>>(
      (resolve) => {
        pending.waiters.push(resolve);
      },
    );
    if (pending.error) throw pending.error;
    if (next.done) return;
    if (next.value) yield next.value;
  }
}

const workerLogger = {
  warn: (...a: unknown[]) => workerLog("warn", "[memeloop-worker]", { a }),
  error: (...a: unknown[]) => workerLog("error", "[memeloop-worker]", { a }),
};

process.on("uncaughtException", (err) => {
  workerLog("error", "[memeloop-worker] uncaughtException", { err });
});
process.on("unhandledRejection", (reason) => {
  workerLog("error", "[memeloop-worker] unhandledRejection", { reason });
});
process.on("exit", (code) => {
  workerLog("error", "[memeloop-worker] exit", { code });
});
for (const sig of [
  "SIGABRT",
  "SIGSEGV",
  "SIGILL",
  "SIGFPE",
  "SIGBUS",
  "SIGTERM",
  "SIGHUP",
  "SIGINT",
] as const) {
  process.on(sig, () => {
    workerLog("error", "[memeloop-worker] signal", { sig });
  });
}

type RuntimeUpdate = { conversationId: string; update: unknown };

const metas = new Map<string, ConversationMeta>();
const messages = new Map<string, ChatMessage[]>();
const definitionStore = new Map<string, AgentDefinition>();

// Seed built-in agent definitions locally to avoid IPC-dependent lookups from within this worker thread.
for (const def of taskAgents as unknown as AgentDefinition[]) {
  if (def?.id) definitionStore.set(def.id, def);
}

/** Prevent unbounded growth of in-memory conversation state inside the worker thread. */
const MAX_WORKER_CONVERSATIONS = 128;

function trimWorkerConversationsIfNeeded(): void {
  while (metas.size > MAX_WORKER_CONVERSATIONS) {
    let oldestId: string | undefined;
    let oldestTs = Number.POSITIVE_INFINITY;
    for (const [id, meta] of metas) {
      const ts = meta.lastMessageTimestamp ?? 0;
      if (ts < oldestTs) {
        oldestTs = ts;
        oldestId = id;
      }
    }
    if (!oldestId) break;
    metas.delete(oldestId);
    messages.delete(oldestId);
    customUpdateListenersByConversationId.delete(oldestId);
    conversationCancellation.delete(oldestId);
  }
}

type AskQuestionPrompt = {
  type: "ask-question";
  questionId?: string;
  question: string;
  inputType?: "single-select" | "multi-select" | "text";
  options?: Array<{ label: string; description?: string }>;
  allowFreeform?: boolean;
};

type ToolApprovalPrompt = {
  type: "tool-approval";
  approvalId: string;
  toolName: string;
  parameters: Record<string, unknown>;
};

type WorkerCustomUpdate =
  | { type: "ask-question"; payload: AskQuestionPrompt }
  | { type: "tool-approval"; payload: ToolApprovalPrompt };

const customUpdateListenersByConversationId = new Map<
  string,
  Set<(update: WorkerCustomUpdate) => void>
>();
function emitCustomUpdate(
  conversationId: string | undefined,
  update: WorkerCustomUpdate,
): void {
  // Some runtimes may pass a different identifier than the one we used for subscribeToUpdates().
  // When we can't match a set by id, broadcast to all listener sets to avoid missing ask-question/tool-approval.
  const setById = conversationId
    ? customUpdateListenersByConversationId.get(conversationId)
    : undefined;
  const targetSets =
    setById && setById.size > 0
      ? [setById]
      : Array.from(customUpdateListenersByConversationId.values());
  if (targetSets.length === 0) return;

  workerLog("warn", "[memeloop-worker] emitCustomUpdate", {
    conversationId,
    type: update.type,
    targetSets: targetSets.length,
    questionId:
      update.type === "ask-question" ? update.payload.questionId : undefined,
    question:
      update.type === "ask-question" ? update.payload.question : undefined,
    inputType:
      update.type === "ask-question" ? update.payload.inputType : undefined,
  });

  // Deduplicate listeners across sets.
  const listeners = new Set<(update: WorkerCustomUpdate) => void>();
  for (const s of targetSets) {
    for (const l of s) listeners.add(l);
  }

  for (const listener of listeners) {
    try {
      listener(update);
    } catch {
      // ignore listener errors
    }
  }
}

const inMemoryStorage = {
  listConversations: async (_options?: unknown) => Array.from(metas.values()),
  getMessages: async (conversationId: string, _options?: unknown) =>
    messages.get(conversationId) ?? [],
  appendMessage: async (message: ChatMessage) => {
    const list = messages.get(message.conversationId) ?? [];
    list.push(message);
    messages.set(message.conversationId, list);
    const meta = metas.get(message.conversationId);
    if (meta) {
      meta.lastMessagePreview = message.content.slice(0, 200);
      meta.lastMessageTimestamp = message.timestamp;
      meta.messageCount = list.length;
      metas.set(message.conversationId, meta);
    }
  },
  upsertConversationMetadata: async (meta: ConversationMeta) => {
    metas.set(meta.conversationId, meta);
    trimWorkerConversationsIfNeeded();
  },
  insertMessagesIfAbsent: async (incoming: ChatMessage[]) => {
    for (const msg of incoming) {
      const list = messages.get(msg.conversationId) ?? [];
      if (!list.some((existing) => existing.messageId === msg.messageId)) {
        list.push(msg);
        messages.set(msg.conversationId, list);
      }
    }
  },
  getAttachment: async (_contentHash: string): Promise<AttachmentRef | null> =>
    null,
  saveAttachment: async (
    _ref: AttachmentRef,
    _data: Buffer | Uint8Array,
  ): Promise<void> => undefined,
  getAgentDefinition: async (id: string): Promise<AgentDefinition | null> => {
    const hit = definitionStore.get(id);
    if (hit) return hit;
    // Avoid calling main-process services from this worker; definitions should be pre-seeded or loaded via runtime wiki manager.
    return null;
  },
  saveAgentInstance: async () => undefined,
  getConversationMeta: async (
    conversationId: string,
  ): Promise<ConversationMeta | null> => metas.get(conversationId) ?? null,
};

const conversationCancellation = new Set<string>();

const llmProvider = {
  name: "tidgi-memeloop-worker",
  chat: async function* (request: unknown) {
    const req = request as {
      messages?: Array<{
        role: "system" | "user" | "assistant" | "tool";
        content: unknown;
      }>;
      conversationId?: string;
    };
    const modelMessages = (req.messages ?? []).map((message) => ({
      role: message.role,
      content:
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content ?? ""),
    }));
    for await (const delta of callMainLlmChat({
      conversationId: req.conversationId,
      messages: modelMessages,
    })) {
      yield { type: "text-delta", content: delta, id: nanoid() };
    }
  },
};

// Minimal wiki manager: boot tiddlywiki directly in worker.
class DesktopTiddlyWikiManager implements IWikiManager {
  private cache = new Map<string, Promise<any>>();
  private readonly agentDefTag = "$:/tags/MemeLoop/AgentDefinition";

  private async bootWikiByPath(wikiPath: string): Promise<any> {
    const absolutePath = path.resolve(wikiPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Wiki path does not exist: ${absolutePath}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TiddlyWiki } = require("tiddlywiki") as { TiddlyWiki: () => any };
    const $tw = TiddlyWiki();
    $tw.boot.argv = [absolutePath, "--load"];
    await new Promise<void>((resolve, reject) => {
      $tw.boot.boot((err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return $tw;
  }

  private async getWiki(wikiId: string): Promise<any> {
    const cached = this.cache.get(wikiId);
    if (cached) return cached;

    const p = (async () => {
      if (wikiId === "default") {
        const workspaces = await workspaceService.getWorkspacesAsList();
        const fallback = workspaces.find(isWikiWorkspace) ?? workspaces[0];
        if (!fallback || !isWikiWorkspace(fallback))
          throw new Error(
            "No wiki workspaces available to resolve wikiId=default",
          );
        return this.bootWikiByPath(fallback.wikiFolderLocation);
      }

      if (path.isAbsolute(wikiId)) {
        return this.bootWikiByPath(wikiId);
      }

      const workspaces = await workspaceService.getWorkspacesAsList();
      const ws = workspaces.find((w) => w.id === wikiId || w.name === wikiId);
      if (!ws || !isWikiWorkspace(ws)) {
        throw new Error(
          `Unable to resolve wikiId "${wikiId}" to a workspace wikiFolderLocation`,
        );
      }
      return this.bootWikiByPath(ws.wikiFolderLocation);
    })();

    this.cache.set(wikiId, p);
    return p;
  }

  clearWikiCache(wikiId?: string): void {
    if (wikiId === undefined) this.cache.clear();
    else this.cache.delete(wikiId);
  }

  async getTiddler(
    wikiId: string,
    title: string,
  ): Promise<TiddlerFields | null> {
    const $tw = await this.getWiki(wikiId);
    const tiddler = $tw.wiki.getTiddler(title);
    if (!tiddler) return null;
    return {
      ...(tiddler.fields ?? {}),
      title,
      type: tiddler.fields?.type ?? "text/vnd.tiddlywiki",
    } as TiddlerFields;
  }

  async setTiddler(wikiId: string, tiddler: TiddlerFields): Promise<void> {
    const $tw = await this.getWiki(wikiId);
    const fields = { ...tiddler };
    if (!fields.title) fields.title = "";
    $tw.wiki.addTiddler(new $tw.Tiddler(fields));
  }

  async listTiddlers(
    wikiId: string,
    filter?: { tag?: string; type?: string },
  ): Promise<TiddlerFields[]> {
    const $tw = await this.getWiki(wikiId);
    let filterStr = "[all[tiddlers]!is[system]sort[title]]";
    if (filter?.tag) {
      filterStr = `[all[tiddlers]!is[system]tag[${filter.tag}]sort[title]]`;
    } else if (filter?.type) {
      filterStr = `[all[tiddlers]!is[system]type[${filter.type}]sort[title]]`;
    }

    const titles: string[] = $tw.wiki.filterTiddlers(filterStr);
    const out: TiddlerFields[] = [];
    for (const title of titles) {
      const tiddler = $tw.wiki.getTiddler(title);
      if (!tiddler) continue;
      out.push({
        ...(tiddler.fields ?? {}),
        title,
        type: tiddler.fields?.type ?? "text/vnd.tiddlywiki",
      } as TiddlerFields);
    }
    return out;
  }

  async search(wikiId: string, query: string): Promise<TiddlerFields[]> {
    const $tw = await this.getWiki(wikiId);
    const escaped = query.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
    const filterStr = `[all[tiddlers]!is[system]search:title,text,tags[${escaped}]]`;
    const titles: string[] = $tw.wiki.filterTiddlers(filterStr);

    const out: TiddlerFields[] = [];
    for (const title of titles) {
      const tiddler = $tw.wiki.getTiddler(title);
      if (!tiddler) continue;
      out.push({
        ...(tiddler.fields ?? {}),
        title,
        type: tiddler.fields?.type ?? "text/vnd.tiddlywiki",
      } as TiddlerFields);
    }
    return out;
  }

  async listAgentDefinitionsFromWiki(wikiId: string): Promise<any[]> {
    const all = await this.listTiddlers(wikiId);
    const out: any[] = [];
    for (const t of all) {
      const tags = t.tags;
      const hasTag = Array.isArray(tags) && tags.includes(this.agentDefTag);
      if (!hasTag) continue;
      const text =
        typeof (t as ITiddlerFields).text === "string"
          ? (t as ITiddlerFields).text
          : "";
      if (!text.trim()) continue;
      try {
        const raw = JSON.parse(text) as any;
        if (raw && typeof raw.id === "string") out.push(raw);
      } catch {
        // skip invalid JSON
      }
    }
    return out;
  }
}

onApprovalRequest((request) => {
  emitCustomUpdate(request.agentId, {
    type: "tool-approval",
    payload: {
      type: "tool-approval",
      approvalId: request.approvalId,
      toolName: request.toolName,
      parameters: request.parameters,
    },
  });
});

const wikiManager = new DesktopTiddlyWikiManager();

const localNodeId = `tidgi-desktop-${nanoid(8)}`;
const terminalManager = new TerminalSessionManager();

let runtime: any;
let storage: any;
let toolRegistry: any;
let runtimeWikiManager: IWikiManager | undefined;
let agentDefinitions: any;
let fileBaseDirResolved: string;
let createNodeServerFn: any;
let runtimeInitPromise: Promise<void> | undefined;

async function ensureRuntimeInitialized(): Promise<void> {
  if (runtime) return;
  if (runtimeInitPromise) {
    await runtimeInitPromise;
    return;
  }

  runtimeInitPromise = (async () => {
    // Avoid worker module init crashes: load memeloop-node lazily.
    const memeloopNode = await import("memeloop-node");
    const { createNodeRuntime, ToolRegistry, createNodeServer } =
      memeloopNode as unknown as {
        createNodeRuntime: typeof memeloopNode.createNodeRuntime;
        ToolRegistry: typeof memeloopNode.ToolRegistry;
        createNodeServer: typeof memeloopNode.createNodeServer;
      };

    createNodeServerFn = createNodeServer;

    const mainBridgeToolIds = await requestMainBridgeToolList().catch(
      (error) => {
        workerLog(
          "warn",
          "[memeloop-worker] failed to load main bridge tool list",
          { error },
        );
        return [] as string[];
      },
    );

    const runtimeResult = createNodeRuntime({
      storage: inMemoryStorage,
      llmProvider,
      toolRegistry: new ToolRegistry(),
      configureTools(registry) {
        // Desktop zx-script adapter: align worker tool id with TidGi llm tool name (`zx-script`).
        registry.registerTool(
          "zx-script",
          async (args: Record<string, unknown>) => {
            const workspaceName = args.workspaceName as string | undefined;
            const script = args.script as string | undefined;
            const fileName =
              (args.fileName as string | undefined) ?? "agent-script.mjs";

            if (!workspaceName || typeof workspaceName !== "string") {
              return { error: "Missing or invalid workspaceName" };
            }
            if (!script || typeof script !== "string") {
              return { error: "Missing or invalid script" };
            }

            const workspaces = await workspaceService.getWorkspacesAsList();
            const target = workspaces.find(
              (ws) => ws.name === workspaceName || ws.id === workspaceName,
            );
            if (!target) {
              return { error: `Workspace "${workspaceName}" not found` };
            }

            const output$ = nativeService.executeZxScript$(
              { fileContent: script, fileName },
              target.id,
            ) as unknown as Observable<string>;
            const outputLines = await firstValueFrom(output$.pipe(toArray()));
            const output = outputLines.join("\n").trim();
            return { result: output || "(script completed with no output)" };
          },
        );

        for (const toolId of mainBridgeToolIds) {
          if (
            typeof registry.getTool === "function" &&
            registry.getTool(toolId)
          )
            continue;
          registry.registerTool(
            toolId,
            async (args: Record<string, unknown>) => {
              return callMainTool(toolId, args ?? {});
            },
          );
        }
      },
      builtinToolContext: {
        getPeers: async () => [],
        sendRpcToNode: async () => ({
          ok: false,
          error: "remoteAgent not configured in desktop worker",
        }),
        mcpCallRemote: async () => ({
          ok: false,
          error: "mcpClient not configured in desktop worker",
        }),
        notifyAskQuestion: (payload: unknown) => {
          const p = payload as Partial<AskQuestionPrompt> & {
            conversationId?: string;
            questionId?: string;
            question?: string;
          };
          if (!p.questionId || !p.question) return;

          emitCustomUpdate(p.conversationId, {
            type: "ask-question",
            payload: {
              type: "ask-question",
              questionId: p.questionId,
              question: p.question,
              inputType: p.inputType ?? undefined,
              options: p.options,
              allowFreeform: p.allowFreeform,
            },
          });
        },
      },
      terminalManager,
      fileBaseDir: process.cwd(),
      wikiManager,
      wikiAgentDefinitionWikiIds: ["default"],
      includeVscodeCli: false,
      conversationCancellation,
      logger: {
        warn: (...a: unknown[]) => workerLogger.warn(...a),
        error: (...a: unknown[]) => workerLogger.error(...a),
      },
      network: {
        start: async () => undefined,
        stop: async () => undefined,
      },
      taskAgent: { maxIterations: 32 },
    });

    runtime = runtimeResult.runtime;
    storage = runtimeResult.storage;
    toolRegistry = runtimeResult.toolRegistry;
    runtimeWikiManager = runtimeResult.wikiManager ?? undefined;
    agentDefinitions = runtimeResult.agentDefinitions;
    fileBaseDirResolved = runtimeResult.fileBaseDirResolved;
  })();

  await runtimeInitPromise;
}

let desktopNodeServer: import("node:http").Server | undefined;
let desktopNodePort: number | undefined;
let desktopNodeStarted = false;
let desktopNodeStartPromise: Promise<void> | undefined;

async function ensureDesktopNodeStarted(): Promise<void> {
  await ensureRuntimeInitialized();
  if (desktopNodeStarted) return;
  if (desktopNodeStartPromise) {
    await desktopNodeStartPromise;
    return;
  }

  desktopNodeStartPromise = (async () => {
    let stage = "init";
    try {
      const desiredPort = parseInt(process.env.TIDGI_MEMELOOP_PORT ?? "", 10);
      stage = "resolve-port";
      const port =
        Number.isFinite(desiredPort) && desiredPort > 0 ? desiredPort : 0;
      workerLog(
        "warn",
        "[memeloop-worker][desktop-as-node] ensureDesktopNodeStarted",
        {
          stage,
          port,
          nodeId: localNodeId,
          env: { NODE_ENV: process.env.NODE_ENV },
        },
      );
      stage = "create-server";
      workerLog(
        "warn",
        "[memeloop-worker][desktop-as-node] before createNodeServer",
        { stage },
      );
      desktopNodeServer = createNodeServerFn({
        port,
        nodeId: localNodeId,
        rpcContext: {
          runtime,
          storage,
          toolRegistry,
          terminalManager,
          wikiManager: runtimeWikiManager,
          nodeId: localNodeId,
          mcpServers: [],
          imChannels: [],
          agentDefinitions,
          fileBaseDir: fileBaseDirResolved,
        },
        serviceName: "tidgi-desktop",
      });
      workerLog(
        "warn",
        "[memeloop-worker][desktop-as-node] after createNodeServer",
        { stage },
      );

      stage = "listen";
      await new Promise<void>((resolve, reject) => {
        workerLog("warn", "[memeloop-worker][desktop-as-node] before listen", {
          stage,
          port,
        });
        const timeout = setTimeout(() => {
          reject(new Error("desktop node server listen timeout"));
        }, 5000);
        desktopNodeServer?.listen(port, () => resolve());
        desktopNodeServer?.once("error", reject);
        desktopNodeServer?.once("listening", () => clearTimeout(timeout));
      });
      workerLog(
        "warn",
        "[memeloop-worker][desktop-as-node] after listen resolved",
        { stage },
      );
      stage = "read-address";
      const address = desktopNodeServer?.address();
      if (address && typeof address === "object") {
        desktopNodePort = (address as AddressInfo).port;
      }
      desktopNodeStarted = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `desktop node start failed at stage=${stage}: ${message}`,
      );
    } finally {
      desktopNodeStartPromise = undefined;
    }
  })();

  await desktopNodeStartPromise;
}

async function stopDesktopNodeServer(): Promise<void> {
  if (!desktopNodeServer) return;
  const server = desktopNodeServer;
  desktopNodeServer = undefined;
  desktopNodeStarted = false;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

const workerState = {
  initializedAt: Date.now(),
};

const memeloopWorker = {
  subscribeLogs: () => logSubject.asObservable(),
  ping: async () => {
    workerLog("warn", "[memeloop-worker] ping");
    await ensureDesktopNodeStarted();
    return {
      ok: true,
      initializedAt: workerState.initializedAt,
      nodeId: localNodeId,
      port: desktopNodePort,
    };
  },
  createAgent: async (definitionId: string, initialMessage?: string) => {
    workerLog("warn", "[memeloop-worker] createAgent", { definitionId });
    await ensureDesktopNodeStarted();
    try {
      await inMemoryStorage.getAgentDefinition(definitionId);
      workerLog(
        "warn",
        "[memeloop-worker] createAgent runtime.createAgent start",
        { definitionId },
      );
      const created = await runtime.createAgent({
        definitionId,
        initialMessage,
      });
      workerLog(
        "warn",
        "[memeloop-worker] createAgent runtime.createAgent done",
        { definitionId, conversationId: created?.conversationId },
      );
      return created;
    } catch (error) {
      workerLog("error", "[memeloop-worker] createAgent failed", {
        definitionId,
        error,
      });
      throw error;
    }
  },
  sendMessage: async (conversationId: string, message: string) => {
    workerLog("warn", "[memeloop-worker] sendMessage start", {
      conversationId,
    });
    await ensureDesktopNodeStarted();
    try {
      await runtime.sendMessage({ conversationId, message });
      workerLog("warn", "[memeloop-worker] sendMessage done", {
        conversationId,
      });
      return { ok: true };
    } catch (e) {
      workerLog("error", "[memeloop-worker] sendMessage failed", {
        conversationId,
        error: e,
      });
      throw e;
    }
  },
  cancelAgent: async (conversationId: string) => {
    workerLog("warn", "[memeloop-worker] cancelAgent", { conversationId });
    conversationCancellation.add(conversationId);
    await runtime.cancelAgent(conversationId);
    return { ok: true };
  },
  subscribeToUpdates: (conversationId: string) =>
    new Observable<RuntimeUpdate>((observer) => {
      workerLog("warn", "[memeloop-worker] subscribeToUpdates start", {
        conversationId,
      });
      const dispose = runtime.subscribeToUpdates(
        conversationId,
        (update: any) => {
          observer.next({ conversationId, update });
        },
      );

      let set = customUpdateListenersByConversationId.get(conversationId);
      if (!set) {
        set = new Set();
        customUpdateListenersByConversationId.set(conversationId, set);
      }

      const listener = (update: WorkerCustomUpdate) => {
        observer.next({ conversationId, update });
      };
      set.add(listener);

      return () => {
        workerLog("warn", "[memeloop-worker] subscribeToUpdates dispose", {
          conversationId,
        });
        set?.delete(listener);
        if (set && set.size === 0)
          customUpdateListenersByConversationId.delete(conversationId);
        dispose();
      };
    }),
  resolveAskQuestion: async (
    _conversationId: string,
    questionId: string,
    answer: string,
  ) => {
    workerLog("warn", "[memeloop-worker] resolveAskQuestion", { questionId });
    const resolved = resolveQuestionAnswer(questionId, answer);
    return { resolved };
  },
  resolveToolApproval: async (
    approvalId: string,
    decision: "allow" | "deny",
  ) => {
    workerLog("warn", "[memeloop-worker] resolveToolApproval", {
      approvalId,
      decision,
    });
    resolveApproval(approvalId, decision);
    return { ok: true };
  },
};

export type MemeLoopWorker = typeof memeloopWorker;

process.on("beforeExit", () => {
  void stopDesktopNodeServer();
});

handleWorkerMessages(memeloopWorker);
