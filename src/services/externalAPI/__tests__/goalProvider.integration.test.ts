import { createLLMProviderFromAccountRoute } from 'memeloop/llm-providers';
import { afterEach, expect, it } from 'vitest';
import { MockOpenAIServer } from '../../../../features/supports/mockOpenAI';

let server: MockOpenAIServer | undefined;

afterEach(async () => {
  await server?.stop();
});

it('streams goal completion through the actual compatible provider', async () => {
  server = new MockOpenAIServer(undefined, [{
    stream: false,
    toolCall: { name: 'goal', arguments: { action: 'complete', evidence: 'VERIFIED' } },
  }]);
  await server.start();
  const route = { modelId: 'test-model', wireModelId: 'test-model', apiMode: 'chat-completions' as const };
  const provider = await createLLMProviderFromAccountRoute({
    account: {
      providerId: 'test-provider',
      providerType: 'openai-compatible',
      baseUrl: `${server.baseUrl}/v1`,
      models: [route],
    },
    route,
    apiKey: 'test-key',
  });
  const stream = await provider.chat({
    providerId: 'test-provider',
    logicalModelId: 'test-model',
    wireModelId: 'test-model',
    apiMode: 'chat-completions',
    stream: true,
    messages: [{ role: 'user', content: 'Complete this goal.' }],
    tools: [{
      name: 'goal',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'complete', 'block'] },
          evidence: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['action'],
      },
    }],
    toolChoice: 'auto',
  });
  if (typeof stream !== 'object' || !(Symbol.asyncIterator in stream)) {
    throw new Error('Expected a portable async model stream');
  }
  const parts = [];
  for await (const part of stream) parts.push(part);
  expect(parts).toContainEqual({
    type: 'tool-call',
    toolCallId: 'call-test-1',
    toolName: 'goal',
    input: { action: 'complete', evidence: 'VERIFIED' },
  });
});
