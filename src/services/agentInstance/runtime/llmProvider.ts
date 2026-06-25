import type { AiAPIConfig, ILLMProvider } from 'memeloop';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import { merge } from 'lodash';

import type { ModelMessage } from '@services/externalAPI/interface';

import type { IAgentInstanceService } from '../interface';

export class MemeLoopDesktopLLMProvider implements ILLMProvider {
  public readonly name = 'tidgi-desktop';

  public readonly chat = (request: unknown): AsyncGenerator<string, void, unknown> => this.chatImpl(request);

  public constructor(
    private readonly options: {
      agentInstanceService: IAgentInstanceService;
      agentDefinitionService: IAgentDefinitionService;
      externalAPIService: IExternalAPIService;
      isCancelled: (agentId: string) => boolean;
    },
  ) {}

  private async *chatImpl(request: unknown): AsyncGenerator<string, void, unknown> {
    const { conversationId, messages } = request as { conversationId?: string; messages?: ModelMessage[] };
    if (!conversationId || !messages) {
      throw new Error('MemeLoopDesktopLLMProvider requires conversationId and messages');
    }

    const agent = await this.options.agentInstanceService.getAgent(conversationId);
    if (!agent) {
      throw new Error(`Agent instance not found: ${conversationId}`);
    }
    const definition = await this.options.agentDefinitionService.getAgentDef(agent.agentDefId);
    if (!definition) {
      throw new Error(`Agent definition not found: ${agent.agentDefId}`);
    }

    const aiApiConfig: AiAPIConfig = merge(
      {},
      await this.options.externalAPIService.getAIConfig(),
      definition.aiApiConfig,
      agent.aiApiConfig,
    );

    let currentRequestId: string | undefined;
    let previousContent = '';
    let chunkCount = 0;

    for await (
      const response of this.options.externalAPIService.generateFromAI(messages, aiApiConfig, { agentInstanceId: conversationId, awaitLogs: true })
    ) {
      if (!currentRequestId && response.requestId) {
        currentRequestId = response.requestId;
      }

      if (this.options.isCancelled(conversationId)) {
        if (currentRequestId) {
          await this.options.externalAPIService.cancelAIRequest(currentRequestId);
        }
        return;
      }

      if (response.status === 'error') {
        const message = response.errorDetail?.message || 'Unknown AI provider error';
        const errorName = response.errorDetail?.name;
        const error = new Error(message);
        if (errorName) error.name = errorName;
        logger.error('MemeLoop LLM provider error', { errorDetail: response.errorDetail, requestId: currentRequestId });
        // Yield the error text so the core loop can persist it as an assistant
        // message instead of aborting the entire turn. This keeps streaming
        // error handling consistent with update/done responses.
        yield message;
        return;
      }

      if ((response.status === 'update' || response.status === 'done') && response.content) {
        const nextContent = response.content;
        const delta = nextContent.startsWith(previousContent) ? nextContent.slice(previousContent.length) : nextContent;
        previousContent = nextContent;
        if (delta.length > 0) {
          chunkCount++;
          yield delta;
        }
      }
    }
    logger.debug('MemeLoop LLM stream complete', { conversationId, chunkCount, contentLength: previousContent.length });
  }
}
