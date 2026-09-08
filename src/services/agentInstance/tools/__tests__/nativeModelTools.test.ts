import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';

import { createNativeModelToolDefinitions } from '../nativeModelTools';
import { wikiOperationDefinition } from '../wikiOperation';
import { wikiSearchDefinition } from '../wikiSearch';

describe('Desktop wiki native model tools', () => {
  it('projects every wiki schema into the provider-native tool registry in input mode', () => {
    const definitions = createNativeModelToolDefinitions({
      'wiki-search': z.object({
        workspaceName: z.string(),
        searchType: z.enum(['filter', 'vector']).optional().default('filter'),
      }),
      'wiki-update-embeddings': z.object({ workspaceName: z.string() }),
      'wiki-operation': z.object({ workspaceName: z.string(), operation: z.string() }),
    });

    expect(definitions.map(definition => definition.name)).toEqual([
      'wiki-search',
      'wiki-update-embeddings',
      'wiki-operation',
    ]);
    expect(definitions.find(definition => definition.name === 'wiki-search')?.inputSchema).toMatchObject({
      type: 'object',
      required: ['workspaceName'],
    });
  });

  it('registers wiki schemas for the native provider even without a prompt insertion target', async () => {
    const registerModelTool = vi.fn();
    await wikiSearchDefinition.onProcessPrompts?.({
      config: { sourceType: 'wiki' },
      toolConfig: { id: 'wiki-search' },
      injectToolList: vi.fn(),
      registerModelTool,
    } as never);
    await wikiOperationDefinition.onProcessPrompts?.({
      config: {},
      toolConfig: { id: 'wiki-operation' },
      injectToolList: vi.fn(),
      registerModelTool,
    } as never);

    expect(registerModelTool).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'wiki-search',
        inputSchema: expect.objectContaining({ required: ['workspaceName'] }),
      }),
    );
    expect(registerModelTool).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'wiki-update-embeddings' }));
    expect(registerModelTool).toHaveBeenNthCalledWith(3, expect.objectContaining({ name: 'wiki-operation' }));
  });
});
