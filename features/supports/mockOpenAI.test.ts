import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockOpenAIServer } from '../supports/mockOpenAI';

describe('Mock OpenAI Server', () => {
  let server: MockOpenAIServer;

  beforeAll(async () => {
    server = new MockOpenAIServer();
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should return valid chat completion with tool call', async () => {
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

  it('should return valid chat completion with tool result response', async () => {
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
            content: 'Wiki search results...',
            tool_call_id: 'call_test_wiki_search',
          },
        ],
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.choices[0].message.role).toBe('assistant');
    expect(data.choices[0].message.content).toContain('TiddlyWiki');
    expect(data.choices[0].finish_reason).toBe('stop');
    expect(data.model).toBe('test-model'); // Verify it returns the requested model
  });

  it('should work with different model names', async () => {
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
    expect(data.choices[0].message.content).toContain('测试响应');
  });

  it('should support streaming response', async () => {
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
  });
});
