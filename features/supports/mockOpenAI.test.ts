import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
});
