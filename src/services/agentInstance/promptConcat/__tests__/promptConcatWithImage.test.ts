import { AgentFrameworkContext } from '../../agentFrameworks/utilities/type';
import { AgentInstanceMessage } from '../../interface';

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('promptConcatStream with image', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should include image part in the last user message prompts', async () => {
    // Mock fs-extra BEFORE importing SUT
    const mockReadFile = vi.fn().mockResolvedValue(Buffer.from('mock-image-data'));
    const mockFs = {
      readFile: mockReadFile,
      ensureDir: vi.fn(),
      copy: vi.fn(),
    };

    vi.doMock('fs-extra', () => ({
      ...mockFs,
      default: mockFs,
    }));

    vi.doMock('@services/libs/log', () => ({
      logger: {
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
      },
    }));

    // Import SUT dynamically
    const { promptConcatStream } = await import('../promptConcat');

    const messages: AgentInstanceMessage[] = [
      {
        id: 'msg1',
        role: 'user',
        agentId: 'agent1',
        content: 'Describe this image',
        metadata: {
          file: { path: '/path/to/image.png', name: 'image.png' },
        },
      } as AgentInstanceMessage,
    ];

    const context: AgentFrameworkContext = {
      agent: { id: 'agent1' } as any,
      agentDef: {} as any,
      isCancelled: () => false,
    };

    const stream = promptConcatStream(
      {
        agentFrameworkConfig: {
          prompts: [],
          response: [],
          plugins: [],
        },
      },
      messages,
      context,
    );

    let finalResult;
    for await (const state of stream) {
      finalResult = state;
    }

    const lastMessage = finalResult?.flatPrompts[finalResult.flatPrompts.length - 1];

    expect(lastMessage).toBeDefined();
    expect(Array.isArray(lastMessage?.content)).toBe(true);

    const content = lastMessage?.content as any[];
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: 'image', image: expect.anything() });
    expect(content[1]).toEqual({ type: 'text', text: 'Describe this image' });

    expect(mockReadFile).toHaveBeenCalledWith('/path/to/image.png');
  });

  it('should fall back to text only if file read fails', async () => {
    const mockReadFile = vi.fn().mockRejectedValue(new Error('Read failed'));
    const mockFs = {
      readFile: mockReadFile,
      ensureDir: vi.fn(),
      copy: vi.fn(),
    };

    vi.doMock('fs-extra', () => ({
      ...mockFs,
      default: mockFs,
    }));

    vi.doMock('@services/libs/log', () => ({
      logger: {
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
      },
    }));

    // Import SUT dynamically
    const { promptConcatStream } = await import('../promptConcat');

    const messages: AgentInstanceMessage[] = [
      {
        id: 'msg1',
        role: 'user',
        agentId: 'agent1',
        content: 'Describe this image',
        metadata: {
          file: { path: '/path/to/image.png' },
        },
      } as AgentInstanceMessage,
    ];

    const context: AgentFrameworkContext = {
      agent: { id: 'agent1' } as any,
      agentDef: {} as any,
      isCancelled: () => false,
    };

    const stream = promptConcatStream(
      {
        agentFrameworkConfig: {
          prompts: [],
          response: [],
          plugins: [],
        },
      },
      messages,
      context,
    );

    let finalResult;
    for await (const state of stream) {
      finalResult = state;
    }

    const logger = (await import('@services/libs/log')).logger;

    const lastMessage = finalResult?.flatPrompts[finalResult.flatPrompts.length - 1];
    expect(lastMessage?.content).toBe('Describe this image');
    expect(logger.error).toHaveBeenCalled();
  });
});
