import type { PortableLlmRequest, PortableLlmStreamPart } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import type { IExternalAPIService } from '@services/externalAPI/interface';
import { MemeLoopDesktopLLMProvider } from '../llmProvider';

function request(overrides: Partial<PortableLlmRequest> = {}): PortableLlmRequest {
  return {
    providerId: 'cpa',
    modelId: 'wire-model',
    logicalModelId: 'logical-model',
    wireModelId: 'wire-model',
    apiMode: 'responses',
    conversationId: 'conversation-1',
    messages: [{ role: 'user', content: 'hello' }],
    stream: true,
    ...overrides,
  };
}

describe('MemeLoopDesktopLLMProvider portable contract', () => {
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
      providerId: 'cpa',
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
      providerId: 'cpa',
      externalAPIService: { generatePortableLlm } as unknown as IExternalAPIService,
    });

    await expect(async () => {
      for await (const _part of provider.chat(request({ providerId: 'forged' })) as AsyncIterable<PortableLlmStreamPart>) {
        // The generator must fail before yielding.
      }
    }).rejects.toMatchObject({ name: 'AgentRunFailure' });
    expect(generatePortableLlm).not.toHaveBeenCalled();
  });
});
