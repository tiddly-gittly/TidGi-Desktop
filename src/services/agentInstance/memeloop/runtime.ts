import type { AgentFrameworkContext, AgentInstanceState, ChatMessage, TaskAgentStep } from 'memeloop';
import { createTaskAgent } from 'memeloop';

import type { IAgentDefinitionService } from '@services/agentDefinitionService';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import type { AgentInstance, IAgentInstanceService } from '../interface';
import type { AgentInstanceMessage } from '../interface';
import { MemeLoopDesktopLLMProvider } from './llmProvider';
import { toMemeLoopMessage } from './messageMapping';
import { MemeLoopDesktopStorage } from './storage';
import { MemeLoopDesktopToolRegistry } from './toolRegistry';
import { type AgentUserContent, createMemeLoopUserMessage } from './userMessage';

export class MemeLoopDesktopRuntime {
  private readonly storage: MemeLoopDesktopStorage;
  private readonly toolRegistry = new MemeLoopDesktopToolRegistry();
  private readonly assistantMessageIds = new Map<string, string>();

  public constructor(
    private readonly options: {
      agentInstanceService: IAgentInstanceService;
      agentDefinitionService: IAgentDefinitionService;
      externalAPIService: IExternalAPIService;
      notifyAgentChanged: (agentId: string, agent: AgentInstance) => void;
      isCancelled: (agentId: string) => boolean;
    },
  ) {
    this.storage = new MemeLoopDesktopStorage({
      agentInstanceService: options.agentInstanceService,
      agentDefinitionService: options.agentDefinitionService,
      notifyAgentChanged: options.notifyAgentChanged,
    });
  }

  public async runTurn(input: {
    agentId: string;
    content: AgentUserContent;
    beforeCommitMap?: Record<string, { wikiFolderLocation: string; commitHash: string }>;
  }): Promise<AgentInstanceState> {
    const userMessage = await createMemeLoopUserMessage({
      agentId: input.agentId,
      content: input.content,
      beforeCommitMap: input.beforeCommitMap,
    });
    const context = this.createContext(input.agentId);
    const taskAgent = createTaskAgent(context);
    let terminalState: AgentInstanceState = 'completed';
    let assistantContent = '';

    try {
      for await (
        const step of taskAgent({
          conversationId: input.agentId,
          message: input.content.text,
          userMessage: toMemeLoopMessage(userMessage, input.agentId),
        })
      ) {
        terminalState = this.resolveTerminalState(step, terminalState);
        if (step.type === 'message') {
          assistantContent += this.stepToText(step.data);
          await this.publishAssistantDraft(input.agentId, assistantContent);
        }
      }
    } catch (error) {
      await this.publishErrorMessage(input.agentId, error);
      return 'failed';
    } finally {
      this.assistantMessageIds.delete(input.agentId);
    }

    return terminalState === 'working' || terminalState === 'submitted' ? 'completed' : terminalState;
  }

  private createContext(agentId: string): AgentFrameworkContext {
    return {
      storage: this.storage,
      llmProvider: new MemeLoopDesktopLLMProvider({
        agentInstanceService: this.options.agentInstanceService,
        agentDefinitionService: this.options.agentDefinitionService,
        externalAPIService: this.options.externalAPIService,
        isCancelled: this.options.isCancelled,
      }),
      tools: this.toolRegistry,
      syncAdapters: [],
      network: {
        async start() {},
        async stop() {},
      },
      logger,
      isCancelled: () => this.options.isCancelled(agentId),
      normalizeMessage: message => {
        const normalized = toMemeLoopMessage(message, message.conversationId);
        if (normalized.role === 'assistant') {
          const assistantMessageId = this.assistantMessageIds.get(normalized.conversationId);
          if (assistantMessageId) {
            normalized.messageId = assistantMessageId;
            normalized.id = assistantMessageId;
            normalized.metadata = { ...normalized.metadata, isComplete: true };
          }
        }
        return normalized;
      },
      resolveAgentRuntimeView: async (agentId: string, messages: ChatMessage[]) => {
        const agent = await this.options.agentInstanceService.getAgent(agentId);
        const definition = agent ? await this.options.agentDefinitionService.getAgentDef(agent.agentDefId) : undefined;
        const globalAIConfig = await this.options.externalAPIService.getAIConfig();
        return {
          ...(agent ?? {}),
          id: agentId,
          messages: messages.map(message => toMemeLoopMessage(message, agentId)),
          agentDefId: agent?.agentDefId ?? definition?.id ?? agentId,
          agentFrameworkConfig: agent?.agentFrameworkConfig ?? definition?.agentFrameworkConfig,
          aiApiConfig: {
            ...globalAIConfig,
            ...definition?.aiApiConfig,
            ...agent?.aiApiConfig,
          },
        };
      },
      taskAgent: {
        maxIterations: 32,
        isCancelled: this.options.isCancelled,
      },
      resolveAgentDefinition: async definitionId => {
        const definition = await this.options.agentDefinitionService.getAgentDef(definitionId);
        if (!definition) return null;
        const { toMemeLoopAgentDefinition } = await import('./messageMapping');
        return toMemeLoopAgentDefinition(definition);
      },
    };
  }

  private stepToText(stepData: unknown): string {
    if (typeof stepData === 'string') return stepData;
    if (stepData && typeof stepData === 'object' && 'content' in stepData) {
      const content = (stepData as { content?: unknown }).content;
      return typeof content === 'string' ? content : JSON.stringify(content);
    }
    return stepData === undefined ? '' : JSON.stringify(stepData);
  }

  private async publishAssistantDraft(agentId: string, content: string): Promise<void> {
    let messageId = this.assistantMessageIds.get(agentId);
    if (!messageId) {
      messageId = `ai-response-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      this.assistantMessageIds.set(agentId, messageId);
    }

    const now = new Date();
    const message: AgentInstanceMessage = {
      id: messageId,
      agentId,
      role: 'assistant',
      content,
      created: now,
      modified: now,
      metadata: { isComplete: false },
      duration: undefined,
    };

    try {
      await this.options.agentInstanceService.saveUserMessage(message);
    } catch {
      const agent = await this.options.agentInstanceService.getAgent(agentId).catch(() => undefined);
      if (!agent) {
        throw new Error(`Agent instance not found: ${agentId}`);
      }
    }
    try {
      this.options.agentInstanceService.debounceUpdateMessage(message, agentId, 0);
    } catch {
      // Framework-only tests do not initialize the database-backed debounce updater.
    }
    const agent = await this.options.agentInstanceService.getAgent(agentId);
    if (!agent) return;

    const existingIndex = agent.messages.findIndex(item => item.id === message.id);
    if (existingIndex >= 0) {
      agent.messages[existingIndex] = message;
    } else {
      agent.messages.push(message);
    }
    this.options.notifyAgentChanged(agentId, agent);
  }

  private async publishErrorMessage(agentId: string, error_: unknown): Promise<void> {
    const now = new Date();
    const messageText = `Error: ${error_ instanceof Error ? error_.message : String(error_)}`;
    const message: AgentInstanceMessage = {
      id: `ai-error-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      agentId,
      role: 'error',
      content: messageText,
      created: now,
      modified: now,
      duration: 1,
      metadata: {
        errorDetail: error_ instanceof Error ? { message: error_.message, name: error_.name } : { message: String(error_) },
      },
    };

    try {
      await this.options.agentInstanceService.saveUserMessage(message);
    } catch {
      const agent = await this.options.agentInstanceService.getAgent(agentId).catch(() => undefined);
      if (!agent) return;
    }
    try {
      this.options.agentInstanceService.debounceUpdateMessage(message, agentId, 0);
    } catch {
      // Framework-only tests do not initialize the database-backed debounce updater.
    }

    const agent = await this.options.agentInstanceService.getAgent(agentId).catch(() => undefined);
    if (!agent) return;
    const existingIndex = agent.messages.findIndex(item => item.id === message.id);
    if (existingIndex >= 0) {
      agent.messages[existingIndex] = message;
    } else {
      agent.messages.push(message);
    }
    this.options.notifyAgentChanged(agentId, agent);
  }

  private resolveTerminalState(step: TaskAgentStep, current: AgentInstanceState): AgentInstanceState {
    if (step.type !== 'thinking') return current;
    const data = step.data as { status?: string };
    if (data.status === 'input-required') return 'input-required';
    if (data.status === 'cancelled') return 'canceled';
    if (data.status === 'max-iterations') return 'completed';
    if (data.status === 'blocked') return 'failed';
    if (data.status === 'calling-llm') return 'working';
    return current;
  }
}
