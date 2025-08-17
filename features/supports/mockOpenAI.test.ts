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
        model: 'test-model', // Use the same model as in feature test
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
    expect(data.choices[0].message).toHaveProperty('tool_calls');
    expect(data.choices[0].message.tool_calls).toHaveLength(1);
    expect(data.choices[0].message.tool_calls[0].function.name).toBe('wiki-search');
    expect(data.choices[0].finish_reason).toBe('tool_calls');
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
            content: null,
            tool_calls: [
              {
                id: 'call_test_wiki_search',
                type: 'function',
                function: {
                  name: 'wiki-search',
                  arguments: '{"workspaceName":"-VPTqPdNOEZHGO5vkwllY","filter":"[title[Index]]"}',
                },
              },
            ],
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
        model: 'gpt-3.5-turbo', // Different model name
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
    expect(data.model).toBe('gpt-3.5-turbo'); // Should return the requested model name
    expect(data.choices[0].message.tool_calls[0].function.name).toBe('wiki-search');
  });
});
