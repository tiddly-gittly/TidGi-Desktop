import type { AgentFrameworkContext, AgentInstanceState, ChatMessage } from 'memeloop';
import { mergeAgentToolsIntoFrameworkConfig, runTaskAgentTurn } from 'memeloop';

import type { IAgentDefinitionService } from '@services/agentDefinitionService';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import type { AgentInstance } from 'memeloop';
import type { IAgentInstanceService } from '../interface';
import { MemeLoopDesktopLLMProvider } from './llmProvider';
import { MemeLoopDesktopStorage } from './storage';
import { MemeLoopDesktopToolRegistry } from './toolRegistry';
import { type AgentUserContent, createMemeLoopUserMessage } from './userMessage';

export class MemeLoopDesktopRuntime {
  private readonly storage: MemeLoopDesktopStorage;
  private readonly toolRegistry = new MemeLoopDesktopToolRegistry();

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

    const result = await runTaskAgentTurn(
      context,
      {
        conversationId: input.agentId,
        message: input.content.text,
        userMessage,
      },
      {
        onProgress: async (status: string) => {
          const agent = await this.options.agentInstanceService.getAgent(input.agentId).catch(() => undefined);
          if (!agent) return;
          agent.status = { state: 'working', progress: status, modified: new Date() };
          this.options.notifyAgentChanged(input.agentId, agent);
        },
      },
    );
    return result.state;
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
        return { ...message, originNodeId: message.originNodeId || 'tidgi-desktop' };
      },
      resolveAgentRuntimeView: async (agentId: string, messages: ChatMessage[]) => {
        const agent = await this.options.agentInstanceService.getAgent(agentId);
        const definition = agent ? await this.options.agentDefinitionService.getAgentDef(agent.agentDefId) : undefined;
        const globalAIConfig = await this.options.externalAPIService.getAIConfig();

        const frameworkConfig = mergeAgentToolsIntoFrameworkConfig(
          agent?.agentFrameworkConfig,
          agent?.agentTools ?? definition?.agentTools,
        );
        const defaultAgent = {
          id: agentId,
          agentDefId: agent?.agentDefId ?? definition?.id ?? agentId,
          status: { state: 'working' as const, modified: new Date() },
          created: new Date(),
          messages: [],
          description: '',
          systemPrompt: '',
          tools: [],
          version: '1',
        };
        return {
          ...(agent ?? defaultAgent),
          id: agentId,
          messages,
          agentDefId: agent?.agentDefId ?? definition?.id ?? agentId,
          status: agent?.status ?? { state: 'working' as const, modified: new Date() },
          created: agent?.created ?? new Date(),
          agentFrameworkConfig: frameworkConfig,
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
        fallbackRegistryTools: false,
      },
      resolveAgentDefinition: async definitionId => {
        const definition = await this.options.agentDefinitionService.getAgentDef(definitionId);
        if (!definition) return null;

        return {
          ...definition,
          agentFrameworkConfig: mergeAgentToolsIntoFrameworkConfig(
            definition.agentFrameworkConfig,
            definition.agentTools,
          ),
        };
      },
    };
  }
}
