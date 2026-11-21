import { extractAgentRunError, type PortableLlmRequest, type PortableLlmStreamPart } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { AuthenticationError, MissingAPIKeyError, MissingBaseURLError } from '@services/externalAPI/errors';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { MemeLoopDesktopLLMProvider } from '../llmProvider';

function request(overrides: Partial<PortableLlmRequest> = {}): PortableLlmRequest {
  return {
    providerId: 'test-provider',
    logicalModelId: 'logical-model',
    wireModelId: 'wire-model',
    apiMode: 'responses',
    conversationId: 'conversation-1',
    messages: [{ role: 'user', content: 'hello' }],
    stream: true,
    ...overrides,
  };
}

describe('MemeLoopDesktopLLMProvider', () => {
  it('forwards the exact request and yields typed stream parts without accumulated-string conversion', async () => {
    const parts: PortableLlmStreamPart[] = [
      { type: 'text-delta', id: 'text-1', text: 'hel' },
      { type: 'reasoning-delta', id: 'reasoning-1', text: 'think' },
      { type: 'text-delta', id: 'text-1', text: 'lo' },
      { type: 'finish', finishReason: 'stop' },
    ];
    const generatePortableLlm = vi.fn(async function*(received: PortableLlmRequest) {
      expect(received).toBe(exactRequest);
      yield* parts;
    });
    const provider = new MemeLoopDesktopLLMProvider({
      providerId: 'test-provider',
      externalAPIService: { generatePortableLlm } as unknown as IExternalAPIService,
    });
    const exactRequest = request();

    const received: PortableLlmStreamPart[] = [];
    for await (const part of provider.chat(exactRequest) as AsyncIterable<PortableLlmStreamPart>) {
      received.push(part);
    }

    expect(received).toEqual(parts);
    expect(generatePortableLlm).toHaveBeenCalledOnce();
    expect(generatePortableLlm).toHaveBeenCalledWith(exactRequest, {
      agentInstanceId: 'conversation-1',
      awaitLogs: true,
      requestTimeoutMs: 120_000,
    });
  });

  it('rejects a request for a different registered provider before transport', async () => {
    const generatePortableLlm = vi.fn();
    const provider = new MemeLoopDesktopLLMProvider({
      providerId: 'test-provider',
      externalAPIService: { generatePortableLlm } as unknown as IExternalAPIService,
    });

    await expect(async () => {
      for await (const _part of provider.chat(request({ providerId: 'forged' })) as AsyncIterable<PortableLlmStreamPart>) {
        // The generator must fail before yielding.
      }
    }).rejects.toMatchObject({ name: 'AgentRunFailure' });
    expect(generatePortableLlm).not.toHaveBeenCalled();
  });

  it.each([
    { code: 'PROVIDER_UNAVAILABLE', createError: () => new Error('transport failed') },
    { code: 'RATE_LIMITED', createError: () => Object.assign(new Error('rate limited'), { status: 429 }) },
  ])('preserves localization parameters for $code', async ({ code, createError }) => {
    const provider = new MemeLoopDesktopLLMProvider({
      providerId: 'test-provider',
      externalAPIService: {
        generatePortableLlm: async function*() {
          yield { type: 'text-delta' as const, id: 'partial', text: '' };
          throw createError();
        },
      } as unknown as IExternalAPIService,
    });
    let received: unknown;
    try {
      for await (const _part of provider.chat(request()) as AsyncIterable<PortableLlmStreamPart>) {
        // Consume until the structured failure is raised.
      }
    } catch (error) {
      received = error;
    }
    expect(extractAgentRunError(received)).toEqual(expect.objectContaining({
      code,
      retryable: true,
      providerId: 'test-provider',
      modelId: 'logical-model',
      localizedParams: { providerId: 'test-provider', modelId: 'logical-model' },
    }));
  });

  it.each([
    {
      createError: () => new MissingAPIKeyError('test-provider'),
      code: 'PROVIDER_AUTH_MISSING',
      settingTarget: { kind: 'provider', providerId: 'test-provider', field: 'apiKey' },
    },
    {
      createError: () => new MissingBaseURLError('test-provider'),
      code: 'PROVIDER_CONFIGURATION_MISSING',
      settingTarget: { kind: 'provider', providerId: 'test-provider', field: 'baseUrl' },
    },
    {
      createError: () => new AuthenticationError('test-provider'),
      code: 'PROVIDER_AUTH_MISSING',
      settingTarget: { kind: 'provider', providerId: 'test-provider', field: 'apiKey' },
    },
  ])('turns provider configuration failures into actionable $code run errors', async ({ createError, code, settingTarget }) => {
    const generatePortableLlm = vi.fn(async function*() {
      yield { type: 'text-delta' as const, id: 'partial', text: '' };
      throw createError();
    });
    const provider = new MemeLoopDesktopLLMProvider({
      providerId: 'test-provider',
      externalAPIService: { generatePortableLlm } as unknown as IExternalAPIService,
    });

    let received: unknown;
    try {
      for await (const _part of provider.chat(request()) as AsyncIterable<PortableLlmStreamPart>) {
        // The provider fails before yielding.
      }
    } catch (error) {
      received = error;
    }

    expect(extractAgentRunError(received)).toEqual(expect.objectContaining({
      code,
      retryable: false,
      providerId: 'test-provider',
      modelId: 'logical-model',
      settingTarget,
    }));
  });
});
