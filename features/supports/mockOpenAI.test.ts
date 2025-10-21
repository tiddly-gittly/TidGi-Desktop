import type { ModelMessage } from 'ai';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AiAPIConfig } from '../../src/services/agentInstance/promptConcat/promptConcatSchema';
import { streamFromProvider } from '../../src/services/externalAPI/callProviderAPI';
import type { AIProviderConfig } from '../../src/services/externalAPI/interface';
import { MockOpenAIServer } from '../supports/mockOpenAI';

describe('Mock OpenAI Server', () => {
  let server: MockOpenAIServer;

  beforeAll(async () => {
    const rules = [
      // Call 1: Wiki search tool use
      {
        response: '<tool_use name="wiki-search">{"workspaceName":"-VPTqPdNOEZHGO5vkwllY","filter":"[title[Index]]"}</tool_use>',
        stream: false,
      },
      // Call 2: Wiki search explanation
      {
        response: '在 TiddlyWiki 中，Index 条目提供了编辑卡片的方法说明，点击右上角的编辑按钮可以开始对当前卡片进行编辑。',
        stream: false,
      },
      // Call 3: Wiki operation with default workspace (will fail)
      {
        response: '<tool_use name="wiki-operation">{"workspaceName":"default","operation":"wiki-add-tiddler","title":"testNote","text":"test"}</tool_use>',
        stream: false,
      },
      // Call 4: Wiki operation with wiki workspace (will succeed)
      {
        response: '<tool_use name="wiki-operation">{"workspaceName":"wiki","operation":"wiki-add-tiddler","title":"test","text":"这是测试内容"}</tool_use>',
        stream: false,
      },
      // Call 5: Wiki operation confirmation
      {
        response: '已成功在工作区 wiki 中创建条目 "test"。',
        stream: false,
      },
      // Call 6: General test response
      {
        response: '这是一个测试响应。',
        stream: false,
      },
    ];

    server = new MockOpenAIServer(undefined, rules);
    await server.start();
  });

  beforeEach(async () => {
    // Reset call count before each test
    await fetch(`${server.baseUrl}/reset`, { method: 'POST' });
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should return valid chat completion with tool call (first API call)', async () => {
    const response = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-key',
      },
      body: JSON.stringify({
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: '搜索 wiki 中的 index 条目并解释',
          },
        ],
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('object', 'chat.completion');
    expect(data).toHaveProperty('created');
    expect(data).toHaveProperty('model', 'test-model'); // Verify it returns the requested model
    expect(data).toHaveProperty('choices');
    expect(data.choices).toHaveLength(1);
    expect(data.choices[0]).toHaveProperty('message');
    expect(data.choices[0].message).toHaveProperty('content');
    expect(data.choices[0].message.content).toContain('<tool_use name="wiki-search">');
    expect(data.choices[0].message.content).toContain('workspaceName');
    expect(data.choices[0].message.content).toContain('-VPTqPdNOEZHGO5vkwllY');
    expect(data.choices[0].finish_reason).toBe('stop');
  });

  it('should return valid chat completion with tool result response (second API call)', async () => {
    // This simulates the second API call in a conversation
    const response = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-key',
      },
      body: JSON.stringify({
        model: 'test-model', // Use the same model as in feature test
        messages: [
          {
            role: 'user',
            content: '搜索 wiki 中的 index 条目并解释',
          },
          {
            role: 'assistant',
            content: '<tool_use name="wiki-search">{"workspaceName":"-VPTqPdNOEZHGO5vkwllY","filter":"[title[Index]]"}</tool_use>',
          },
          {
            role: 'tool',
            content:
              'Tool: wiki-search\nParameters: {"workspaceName":"-VPTqPdNOEZHGO5vkwllY","filter":"[title[Index]]"}\nError: Workspace with name or ID "-VPTqPdNOEZHGO5vkwllY" does not exist. Available workspaces: wiki (abc123), agent (agent), help (help), guide (guide), add (add)',
          },
        ],
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.choices[0].message.role).toBe('assistant');
    // Each test is reset, so this is also the first call returning wiki-search tool use
    expect(data.choices[0].message.content).toContain('<tool_use name="wiki-search">');
    expect(data.choices[0].finish_reason).toBe('stop');
    expect(data.model).toBe('test-model'); // Verify it returns the requested model
  });

  it('should work with different model names (first API call)', async () => {
    const response = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-key',
      },
      body: JSON.stringify({
        model: 'custom-model-name',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.model).toBe('custom-model-name');
    expect(data.choices[0].message.role).toBe('assistant');
    // First call returns wiki-search tool use, not the Hello response
    expect(data.choices[0].message.content).toContain('<tool_use name="wiki-search">');
  });

  it('should support streaming response (first API call)', async () => {
    const response = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-key',
      },
      body: JSON.stringify({
        model: 'test-model',
        stream: true,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let chunks = '';

    if (reader) {
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunks += decoder.decode(value);
        }
      }
    }

    expect(chunks).toContain('data:');
    expect(chunks).toContain('[DONE]');
    expect(chunks).toContain('chat.completion.chunk');
    // First call returns wiki-search tool use (check for JSON-escaped content)
    expect(chunks).toContain('wiki-search');
  });

  it('should reproduce exact three-call conversation (wiki search + wiki operation)', async () => {
    // Call 1: First API call returns wiki search tool use
    let res = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
      body: JSON.stringify({ model: 'test-model', messages: [{ role: 'user', content: '搜索 wiki 中的 index 条目并解释' }] }),
    });

    expect(res.status).toBe(200);
    let data = await res.json();
    expect(String(data.choices[0].message.content)).toBe(
      '<tool_use name="wiki-search">{"workspaceName":"-VPTqPdNOEZHGO5vkwllY","filter":"[title[Index]]"}</tool_use>',
    );

    // Call 2: Second API call returns explanation
    res = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
      body: JSON.stringify({
        model: 'test-model',
        messages: [
          { role: 'user', content: '搜索 wiki 中的 index 条目并解释' },
          { role: 'assistant', content: '<tool_use name="wiki-search">{"workspaceName":"-VPTqPdNOEZHGO5vkwllY","filter":"[title[Index]]"}</tool_use>' },
          { role: 'tool', content: 'Tool: wiki-search\nParameters: ...\nError: Workspace not found' },
        ],
      }),
    });

    expect(res.status).toBe(200);
    data = await res.json();
    expect(String(data.choices[0].message.content)).toContain('TiddlyWiki 中，Index 条目提供了编辑卡片的方法说明');

    // Call 3: Third API call (start wiki operation) returns default workspace tool use
    res = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
      body: JSON.stringify({
        model: 'test-model',
        messages: [
          { role: 'user', content: '在 wiki 里创建一个新笔记，内容为 test' },
        ],
      }),
    });

    expect(res.status).toBe(200);
    data = await res.json();
    expect(String(data.choices[0].message.content)).toBe(
      '<tool_use name="wiki-operation">{"workspaceName":"default","operation":"wiki-add-tiddler","title":"testNote","text":"test"}</tool_use>',
    );
  });

  it('should integrate with streamFromProvider (SDK) for streaming responses', async () => {
    // Reuse the existing server and update its rules to a single streaming rule
    const streamingRule = [{ response: 'chunkA<stream_split>chunkB<stream_split>chunkC', stream: true }];
    server.setRules(streamingRule);

    // Build provider config that points to our mock server as openAICompatible
    const providerConfig: AIProviderConfig = {
      provider: 'TestProvider',
      providerClass: 'openAICompatible',
      baseURL: `${server.baseUrl}/v1`,
      apiKey: 'test-key',
      models: [{ name: 'test-model' }],
      enabled: true,
    };

    const messages: ModelMessage[] = [
      { role: 'user', content: 'Start streaming' },
    ];

    // streamFromProvider returns an object from streamText; call it and iterate
    const aiConfig: AiAPIConfig = { api: { provider: 'TestProvider', model: 'test-model' }, modelParameters: {} } as AiAPIConfig;
    const stream = streamFromProvider(aiConfig, messages, new AbortController().signal, providerConfig);

    // The returned stream should expose `.textStream` as an AsyncIterable
    // We'll collect chunks as they arrive and assert intermediate states are streaming
    const receivedChunks: string[] = [];
    if (!stream.textStream) throw new Error('Expected stream.textStream to be present');

    for await (const chunk of stream.textStream) {
      if (!chunk) continue;
      let contentPiece: string | undefined;
      if (typeof chunk === 'string') contentPiece = chunk;
      else if (typeof chunk === 'object' && chunk !== null && 'content' in (chunk as Record<string, unknown>)) {
        const c = (chunk as Record<string, unknown>).content;
        if (typeof c === 'string') contentPiece = c;
      }

      if (contentPiece) {
        // Append to receivedChunks and assert intermediate streaming behavior
        receivedChunks.push(contentPiece);

        // Intermediate assertions:
        // - After first chunk: should contain only chunkA and not yet contain chunkC
        if (receivedChunks.length === 1) {
          expect(receivedChunks.join('')).toContain('chunkA');
          expect(receivedChunks.join('')).not.toContain('chunkC');
        }

        // - After second chunk: should contain chunkA and chunkB, but not chunkC
        if (receivedChunks.length === 2) {
          expect(receivedChunks.join('')).toContain('chunkA');
          expect(receivedChunks.join('')).toContain('chunkB');
          expect(receivedChunks.join('')).not.toContain('chunkC');
        }
      }
    }

    // After stream completion, assemble chunks using the same '<stream_split>' separator used by rules
    const assembled = receivedChunks.join('<stream_split>');
    // streamingRule[0].response uses '<stream_split>' as separator, verify equality
    expect(assembled).toBe(streamingRule[0].response);
  });
});
