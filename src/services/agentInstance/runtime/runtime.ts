import type { AgentFrameworkContext, AgentInstanceState, AgentLoopGenerator, AgentLoopInput, AgentLoopRuntime, ChatMessage } from 'memeloop';
import {
  createAgentLoopRunner,
  mergeAgentToolsIntoFrameworkConfig,
  registerBuiltinLoops,
  registerBuiltinPromptPlugins,
  registerBuiltinToolPlugins,
  runAgentToolLoopTurn,
} from 'memeloop';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';
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
      deviceNetworkService: IDeviceNetworkService;
      notifyAgentChanged: (agentId: string, agent: AgentInstance) => void;
      isCancelled: (agentId: string) => boolean;
      loopScriptPolicy?: AgentFrameworkContext['loopScriptPolicy'];
    },
  ) {
    this.storage = new MemeLoopDesktopStorage({
      agentInstanceService: options.agentInstanceService,
      agentDefinitionService: options.agentDefinitionService,
      notifyAgentChanged: options.notifyAgentChanged,
    });
    registerBuiltinLoops();
    registerBuiltinToolPlugins();
    registerBuiltinPromptPlugins(this.toolRegistry.getPromptPlugins());
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
    const runner = await this.createProfileRunner(input.agentId, context);

    const result = await runAgentToolLoopTurn(
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
        agentToolLoop: runner ?? undefined,
      },
    );
    return result.state;
  }

  private async createProfileRunner(agentId: string, context: AgentFrameworkContext): Promise<((input: AgentLoopInput) => AgentLoopGenerator) | null> {
    const agent = await this.options.agentInstanceService.getAgent(agentId);
    if (!agent) return null;

    return createAgentLoopRunner(context, {
      definitionId: agent.agentDefId,
      conversationId: agentId,
    });
  }

  private createRunChildAgent(parentAgentId: string): AgentLoopRuntime['runChildAgent'] {
    return (input: Parameters<AgentLoopRuntime['runChildAgent']>[0]) => this.runChildAgent(parentAgentId, input);
  }

  private async *runChildAgent(parentAgentId: string, input: Parameters<AgentLoopRuntime['runChildAgent']>[0]): AgentLoopGenerator {
    const childAgent = await this.options.agentInstanceService.createAgent(input.profileId, { volatile: true });
    await this.options.agentInstanceService.updateAgent(childAgent.id, {
      name: `Sub-task: ${input.prompt.slice(0, 50)}`,
    });

    const childContext = this.createContext(childAgent.id, parentAgentId);
    const childRunner = await this.createProfileRunner(childAgent.id, childContext);
    if (!childRunner) {
      yield { type: 'message', data: `Child agent profile not found: ${input.profileId}` };
      return;
    }

    yield* childRunner({
      conversationId: childAgent.id,
      message: input.prompt,
    });
  }

  private createContext(agentId: string, parentAgentId?: string): AgentFrameworkContext {
    const isCancelled = (targetAgentId: string): boolean => {
      return this.options.isCancelled(targetAgentId) || (parentAgentId ? this.options.isCancelled(parentAgentId) : false);
    };

    return {
      storage: this.storage,
      llmProvider: new MemeLoopDesktopLLMProvider({
        agentInstanceService: this.options.agentInstanceService,
        agentDefinitionService: this.options.agentDefinitionService,
        externalAPIService: this.options.externalAPIService,
        isCancelled,
      }),
      tools: this.toolRegistry,
      syncAdapters: [],
      network: this.options.deviceNetworkService,
      logger,
      loopScriptPolicy: this.options.loopScriptPolicy,
      isCancelled: () => isCancelled(agentId),
      runChildAgent: this.createRunChildAgent(agentId),
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
      agentToolLoop: {
        maxIterations: 32,
        isCancelled,
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
