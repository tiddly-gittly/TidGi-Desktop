import {
  AGENT_RUN_ERROR_MESSAGE_KEYS,
  AgentRunFailure,
  assertPortableLlmRequest,
  createAgentRunError,
  createMissingApiKeyAgentRunError,
  createMissingProviderSettingAgentRunError,
  type ILLMProvider,
  type PortableLlmRequest,
  type PortableLlmStreamPart,
} from 'memeloop';

import { extractErrorDetails } from '@services/externalAPI/errorHandlers';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';

export class MemeLoopDesktopLLMProvider implements ILLMProvider {
  public readonly name: string;

  public readonly chat = (request: PortableLlmRequest): AsyncGenerator<PortableLlmStreamPart, void, unknown> => this.chatImpl(request);

  public constructor(
    private readonly options: {
      providerId: string;
      externalAPIService: IExternalAPIService;
    },
  ) {
    this.name = options.providerId;
  }

  private async *chatImpl(request: PortableLlmRequest): AsyncGenerator<PortableLlmStreamPart, void, unknown> {
    assertPortableLlmRequest(request);
    const { conversationId } = request;
    if (!conversationId) throw typedRuntimeError('INVALID_REQUEST', false);
    if (request.providerId !== this.name) throw typedRuntimeError('INVALID_REQUEST', false);
    let chunkCount = 0;
    try {
      for await (
        const part of this.options.externalAPIService.generatePortableLlm(request, {
          agentInstanceId: conversationId,
          awaitLogs: true,
          requestTimeoutMs: 120_000,
        })
      ) {
        request.signal?.throwIfAborted();
        chunkCount++;
        yield part;
      }
    } catch (error) {
      request.signal?.throwIfAborted();
      const detail = extractErrorDetails(error, request.providerId);
      logger.error('MemeLoop LLM provider error', { code: detail.code, provider: request.providerId });
      throw providerRunFailure(detail, request);
    }
    logger.debug('MemeLoop LLM stream complete', { conversationId, chunkCount });
  }
}

function typedRuntimeError(
  code: 'INVALID_REQUEST' | 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED',
  retryable: boolean,
): AgentRunFailure {
  return new AgentRunFailure(createAgentRunError({
    code,
    messageKey: AGENT_RUN_ERROR_MESSAGE_KEYS[code],
    retryable,
  }));
}

function providerRunFailure(
  detail: import('@services/externalAPI/interface').AIErrorDetail | undefined,
  request: PortableLlmRequest,
): AgentRunFailure {
  const providerId = request.providerId;
  const modelId = request.logicalModelId;
  switch (detail?.code) {
    case 'MISSING_API_KEY':
      return new AgentRunFailure(createMissingApiKeyAgentRunError({ providerId, modelId }));
    case 'MISSING_BASE_URL':
      return new AgentRunFailure(createMissingProviderSettingAgentRunError({ providerId, modelId, field: 'baseUrl' }));
    case 'NO_DEFAULT_MODEL':
      return new AgentRunFailure(createMissingProviderSettingAgentRunError({ providerId, modelId, field: 'model' }));
    case 'AUTHENTICATION_FAILED':
      return new AgentRunFailure(createAgentRunError({
        code: 'PROVIDER_AUTH_MISSING',
        messageKey: AGENT_RUN_ERROR_MESSAGE_KEYS.PROVIDER_AUTH_MISSING,
        retryable: false,
        providerId,
        modelId,
        localizedParams: { providerId, modelId, settingField: 'apiKey' },
        settingTarget: { kind: 'provider', providerId, field: 'apiKey' },
      }));
    case 'MODEL_NOT_FOUND':
      return new AgentRunFailure(createAgentRunError({
        code: 'MODEL_NOT_FOUND',
        messageKey: AGENT_RUN_ERROR_MESSAGE_KEYS.MODEL_NOT_FOUND,
        retryable: false,
        providerId,
        modelId,
        localizedParams: { providerId, modelId },
        settingTarget: { kind: 'model', providerId, modelId },
      }));
    case 'RATE_LIMIT_EXCEEDED':
      return typedRuntimeError('RATE_LIMITED', true);
    default:
      return typedRuntimeError('PROVIDER_UNAVAILABLE', true);
  }
}
