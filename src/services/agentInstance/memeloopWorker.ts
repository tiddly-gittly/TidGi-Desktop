import 'source-map-support/register';

import { nanoid } from 'nanoid';
import { firstValueFrom, Observable, toArray } from 'rxjs';
import path from 'node:path';
import fs from 'node:fs';
import type { ITiddlerFields } from 'tiddlywiki';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { AgentDefinition, AttachmentRef, ChatMessage, ConversationMeta } from '@memeloop/protocol';

import {
  createMemeLoopRuntime,
  createTaskAgent,
  registerBuiltinTools,
  resolveApproval,
  resolveQuestionAnswer,
  onApprovalRequest,
} from 'memeloop';
import { handleWorkerMessages } from '@services/libs/workerAdapter';
import {
  agentDefinition as agentDefinitionService,
  externalAPI as providerRegistryService,
  native as nativeService,
  workspace as workspaceService,
} from '@services/wiki/wikiWorker/services';
import type { AgentFrameworkContext, IAgentStorage, IToolRegistry, PromptConcatHooks } from 'memeloop';
import type { IWikiManager, TiddlerFields } from 'memeloop-node/src/knowledge/wikiManager';
import { registerWikiTools } from 'memeloop-node/src/tools/wikiTools';
import { registerFileTools } from 'memeloop-node/src/tools/fileSystem';
import { registerTerminalTools } from 'memeloop-node/src/tools/terminal';
import { registerGenericNodeTools } from 'memeloop-node/src/tools/genericNodeTools';
import { TerminalSessionManager } from './terminal/sessionManager';

type RuntimeUpdate = { conversationId: string; update: unknown };

const metas = new Map<string, ConversationMeta>();
const messages = new Map<string, ChatMessage[]>();
const definitionStore = new Map<string, AgentDefinition>();

type AskQuestionPrompt = {
  type: 'ask-question';
  questionId?: string;
  question: string;
  inputType?: 'single-select' | 'multi-select' | 'text';
  options?: Array<{ label: string; description?: string }>;
  allowFreeform?: boolean;
};

type ToolApprovalPrompt = {
  type: 'tool-approval';
  approvalId: string;
  toolName: string;
  parameters: Record<string, unknown>;
};

type WorkerCustomUpdate =
  | { type: 'ask-question'; payload: AskQuestionPrompt }
  | { type: 'tool-approval'; payload: ToolApprovalPrompt };

const customUpdateListenersByConversationId = new Map<string, Set<(update: WorkerCustomUpdate) => void>>();
function emitCustomUpdate(conversationId: string, update: WorkerCustomUpdate): void {
  const set = customUpdateListenersByConversationId.get(conversationId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(update);
    } catch {
      // ignore listener errors
    }
  }
}

const inMemoryStorage = {
  listConversations: async (_options?: unknown) => Array.from(metas.values()),
  getMessages: async (conversationId: string, _options?: unknown) => messages.get(conversationId) ?? [],
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
  },
  insertMessagesIfAbsent: async (incoming: ChatMessage[]) => {
    for (const msg of incoming) {
      const list = messages.get(msg.conversationId) ?? [];
      if (!list.some(existing => existing.messageId === msg.messageId)) {
        list.push(msg);
        messages.set(msg.conversationId, list);
      }
    }
  },
  getAttachment: async (_contentHash: string): Promise<AttachmentRef | null> => null,
  saveAttachment: async (_ref: AttachmentRef, _data: Buffer | Uint8Array): Promise<void> => undefined,
  getAgentDefinition: async (id: string): Promise<AgentDefinition | null> => {
    const hit = definitionStore.get(id);
    if (hit) return hit;
    const fetched = await agentDefinitionService.getAgentDef(id);
    if (fetched) {
      const normalized = fetched as unknown as AgentDefinition;
      definitionStore.set(id, normalized);
      return normalized;
    }
    return null;
  },
  saveAgentInstance: async () => undefined,
  getConversationMeta: async (conversationId: string): Promise<ConversationMeta | null> => metas.get(conversationId) ?? null,
};

class SimpleToolRegistry implements IToolRegistry {
  private tools = new Map<string, unknown>();
  private readonly promptPlugins = new Map<string, (hooks: PromptConcatHooks) => void>();

  getPromptPlugins(): Map<string, (hooks: PromptConcatHooks) => void> {
    return this.promptPlugins;
  }

  registerTool(id: string, impl: unknown): void {
    this.tools.set(id, impl);
  }

  getTool(id: string): unknown | undefined {
    return this.tools.get(id);
  }

  listTools(): string[] {
    return Array.from(this.tools.keys());
  }
}

const toolRegistry = new SimpleToolRegistry();

const conversationCancellation = new Set<string>();

const llmProvider = {
  name: 'tidgi-memeloop-worker',
  chat: async function* (request: unknown) {
    const req = request as {
      messages?: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: unknown }>;
      conversationId?: string;
    };
    const aiConfig = await providerRegistryService.getAIConfig();
    const modelMessages = (req.messages ?? []).map(message => ({
      role: message.role,
      content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? ''),
    }));
    // `electron-ipc-cat` proxies can widen the return type to Promise<AsyncGenerator<...>>,
    // so we explicitly await before `for await`.
    const generator = await (providerRegistryService as any).generateFromAI(modelMessages as any, aiConfig, {
      agentInstanceId: req.conversationId,
    });
    for await (const event of generator as AsyncIterable<any>) {
      if (event?.status === 'update' || event?.status === 'done') {
        yield {
          type: 'text-delta',
          content: String(event?.content ?? ''),
          id: nanoid(),
        };
      }
    }
  },
};

// Desktop zx-script adapter: keep worker-side tool IDs aligned with TidGi llm tool name (`zx-script`).
toolRegistry.registerTool('zx-script', async (args: Record<string, unknown>) => {
  const workspaceName = args.workspaceName as string | undefined;
  const script = args.script as string | undefined;
  const fileName = (args.fileName as string | undefined) ?? 'agent-script.mjs';

  if (!workspaceName || typeof workspaceName !== 'string') {
    return { error: 'Missing or invalid workspaceName' };
  }
  if (!script || typeof script !== 'string') {
    return { error: 'Missing or invalid script' };
  }

  const workspaces = await workspaceService.getWorkspacesAsList();
  const target = workspaces.find(ws => ws.name === workspaceName || ws.id === workspaceName);
  if (!target) {
    return { error: `Workspace "${workspaceName}" not found` };
  }

  const output$ = nativeService.executeZxScript$({ fileContent: script, fileName }, target.id) as unknown as Observable<string>;
  const outputLines = await firstValueFrom(output$.pipe(toArray()));
  const output = outputLines.join('\n').trim();
  return { result: output || '(script completed with no output)' };
});

// Minimal wiki manager: boot tiddlywiki directly in worker.
class DesktopTiddlyWikiManager implements IWikiManager {
  private cache = new Map<string, Promise<any>>();
  private readonly agentDefTag = '$:/tags/MemeLoop/AgentDefinition';

  private async bootWikiByPath(wikiPath: string): Promise<any> {
    const absolutePath = path.resolve(wikiPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Wiki path does not exist: ${absolutePath}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TiddlyWiki } = require('tiddlywiki') as { TiddlyWiki: () => any };
    const $tw = TiddlyWiki();
    $tw.boot.argv = [absolutePath, '--load'];
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
      if (wikiId === 'default') {
        const workspaces = await workspaceService.getWorkspacesAsList();
        const fallback = workspaces.find(isWikiWorkspace) ?? workspaces[0];
        if (!fallback || !isWikiWorkspace(fallback)) throw new Error('No wiki workspaces available to resolve wikiId=default');
        return this.bootWikiByPath(fallback.wikiFolderLocation);
      }

      if (path.isAbsolute(wikiId)) {
        return this.bootWikiByPath(wikiId);
      }

      const workspaces = await workspaceService.getWorkspacesAsList();
      const ws = workspaces.find(w => w.id === wikiId || w.name === wikiId);
      if (!ws || !isWikiWorkspace(ws)) {
        throw new Error(`Unable to resolve wikiId "${wikiId}" to a workspace wikiFolderLocation`);
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

  async getTiddler(wikiId: string, title: string): Promise<TiddlerFields | null> {
    const $tw = await this.getWiki(wikiId);
    const tiddler = $tw.wiki.getTiddler(title);
    if (!tiddler) return null;
    return { ...(tiddler.fields ?? {}), title, type: tiddler.fields?.type ?? 'text/vnd.tiddlywiki' } as TiddlerFields;
  }

  async setTiddler(wikiId: string, tiddler: TiddlerFields): Promise<void> {
    const $tw = await this.getWiki(wikiId);
    const fields = { ...tiddler };
    if (!fields.title) fields.title = '';
    $tw.wiki.addTiddler(new $tw.Tiddler(fields));
  }

  async listTiddlers(wikiId: string, filter?: { tag?: string; type?: string }): Promise<TiddlerFields[]> {
    const $tw = await this.getWiki(wikiId);
    let filterStr = '[all[tiddlers]!is[system]sort[title]]';
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
      out.push({ ...(tiddler.fields ?? {}), title, type: tiddler.fields?.type ?? 'text/vnd.tiddlywiki' } as TiddlerFields);
    }
    return out;
  }

  async search(wikiId: string, query: string): Promise<TiddlerFields[]> {
    const $tw = await this.getWiki(wikiId);
    const escaped = query.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
    const filterStr = `[all[tiddlers]!is[system]search:title,text,tags[${escaped}]]`;
    const titles: string[] = $tw.wiki.filterTiddlers(filterStr);

    const out: TiddlerFields[] = [];
    for (const title of titles) {
      const tiddler = $tw.wiki.getTiddler(title);
      if (!tiddler) continue;
      out.push({ ...(tiddler.fields ?? {}), title, type: tiddler.fields?.type ?? 'text/vnd.tiddlywiki' } as TiddlerFields);
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
      const text = typeof (t as ITiddlerFields).text === 'string' ? (t as ITiddlerFields).text : '';
      if (!text.trim()) continue;
      try {
        const raw = JSON.parse(text) as any;
        if (raw && typeof raw.id === 'string') out.push(raw);
      } catch {
        // skip invalid JSON
      }
    }
    return out;
  }
}

// Register node tooling for the worker runtime.
registerTerminalTools(toolRegistry, new TerminalSessionManager());
registerFileTools(toolRegistry, process.cwd());
registerWikiTools(toolRegistry, new DesktopTiddlyWikiManager(), 'default');
registerGenericNodeTools(toolRegistry);

// Wire tool approval requests (used by memeloop taskAgent when toolPermissions.action === "ask").
onApprovalRequest((request) => {
  emitCustomUpdate(request.agentId, {
    type: 'tool-approval',
    payload: {
      type: 'tool-approval',
      approvalId: request.approvalId,
      toolName: request.toolName,
      parameters: request.parameters,
    },
  });
});

const runtimeContext: AgentFrameworkContext = {
  storage: inMemoryStorage,
  llmProvider,
  tools: toolRegistry,
  syncAdapters: [],
  network: {
    start: async () => undefined,
    stop: async () => undefined,
  },
  conversationCancellation,
  resolveAgentDefinition: async (definitionId: string) => inMemoryStorage.getAgentDefinition(definitionId),
  taskAgent: {
    maxIterations: 32,
    isCancelled: (cid: string) => conversationCancellation.has(cid),
  },
  logger: {
    warn: (...a: unknown[]) => console.warn('[memeloop-worker]', ...a),
    error: (...a: unknown[]) => console.error('[memeloop-worker]', ...a),
  },
};

runtimeContext.runTaskAgent = createTaskAgent(runtimeContext);

registerBuiltinTools(toolRegistry, {
  ...runtimeContext,
  runLocalAgent: runtimeContext.runTaskAgent,
  getPeers: async () => [],
  sendRpcToNode: async () => ({ ok: false, error: 'remoteAgent not configured in desktop worker' }),
  mcpCallRemote: async () => ({ ok: false, error: 'mcpClient not configured in desktop worker' }),
  notifyAskQuestion: ({ questionId, question, conversationId }: { questionId: string; question: string; conversationId: string }) => {
    emitCustomUpdate(conversationId, {
      type: 'ask-question',
      payload: {
        type: 'ask-question',
        questionId,
        question,
        inputType: 'text',
        allowFreeform: true,
      },
    });
  },
} as any);

const runtime = createMemeLoopRuntime(runtimeContext);

const workerState = {
  initializedAt: Date.now(),
};

const memeloopWorker = {
  ping: async () => ({ ok: true, initializedAt: workerState.initializedAt }),
  createAgent: async (definitionId: string, initialMessage?: string) => {
    // Ensure the definition is cached early so the first turn can build prompts.
    await inMemoryStorage.getAgentDefinition(definitionId);
    return await runtime.createAgent({ definitionId, initialMessage });
  },
  sendMessage: async (conversationId: string, message: string) => {
    await runtime.sendMessage({ conversationId, message });
    return { ok: true };
  },
  cancelAgent: async (conversationId: string) => {
    conversationCancellation.add(conversationId);
    await runtime.cancelAgent(conversationId);
    return { ok: true };
  },
  subscribeToUpdates: (conversationId: string) =>
    new Observable<RuntimeUpdate>((observer) => {
      const dispose = runtime.subscribeToUpdates(conversationId, update => {
        observer.next({ conversationId, update });
      });

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
        set?.delete(listener);
        if (set && set.size === 0) customUpdateListenersByConversationId.delete(conversationId);
        dispose();
      };
    }),
  resolveAskQuestion: async (_conversationId: string, questionId: string, answer: string) => {
    const resolved = resolveQuestionAnswer(questionId, answer);
    return { resolved };
  },
  resolveToolApproval: async (approvalId: string, decision: 'allow' | 'deny') => {
    resolveApproval(approvalId, decision);
    return { ok: true };
  },
};

export type MemeLoopWorker = typeof memeloopWorker;

handleWorkerMessages(memeloopWorker);
