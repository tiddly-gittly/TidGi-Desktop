/**
 * Integration test: verify that builtin agent definitions with agentTools
 * produce prompt output with tool descriptions.
 *
 * This covers the real pipeline: builtin JSON → mergeAgentToolsIntoFrameworkConfig → concatPrompt → tool descriptions.
 */
import type { ChatMessage } from 'memeloop';

import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import type { AgentFrameworkConfig } from 'memeloop';
import { getBuiltinAgentDefinitions, mergeAgentToolsIntoFrameworkConfig } from 'memeloop';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('default agent tools → prompt integration', () => {
  let agentInstanceService: IAgentInstanceService;

  beforeEach(async () => {
    vi.clearAllMocks();
    container.get(serviceIdentifier.AgentDefinition);
    agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    await agentInstanceService.initializeFrameworks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builtin general-assistant agentTools are reflected in the prompt', async () => {
    const defaultAgent = getBuiltinAgentDefinitions().find(agent => agent.id === 'memeloop:general-assistant') as unknown as {
      id: string;
      agentTools?: Array<{ toolId: string; parameters?: Record<string, unknown> }>;
      agentFrameworkConfig: Record<string, unknown>;
    };

    expect(defaultAgent.agentTools).toBeDefined();
    expect(defaultAgent.agentTools!.length).toBeGreaterThanOrEqual(4);

    const mergedConfig = mergeAgentToolsIntoFrameworkConfig(
      defaultAgent.agentFrameworkConfig as unknown as AgentFrameworkConfig,
      defaultAgent.agentTools,
    );

    expect(mergedConfig.plugins).toBeDefined();
    const pluginToolIds = (mergedConfig.plugins as Array<{ toolId: string }>).map(p => p.toolId);
    expect(pluginToolIds).toContain('wikiSearch');
    expect(pluginToolIds).toContain('wikiOperation');
    expect(pluginToolIds).toContain('modelContextProtocol');
    expect(pluginToolIds).toContain('workspacesList');

    // Preserve non-tool prompt modifiers like fullReplacement
    expect(pluginToolIds).toContain('fullReplacement');

    // Diagnostic: check plugin registry
    const { pluginRegistry: pr } = await import('@services/agentInstance/tools/index');
    const { getAllToolDefinitions: gtd } = await import('@services/agentInstance/tools/defineTool');
    const toolDefs = gtd();
    console.log('toolRegistry keys:', Array.from(toolDefs.keys()));
    console.log('pluginRegistry keys:', Array.from(pr.keys()));
    console.log('pluginRegistry size:', pr.size);
    console.log('mergedConfig plugins:', JSON.stringify(mergedConfig.plugins).substring(0, 300));

    // Call concatPrompt and verify it produces output with tool descriptions
    const messages: ChatMessage[] = [{
      messageId: 'test-msg-1',
      conversationId: 'test-agent',
      originNodeId: 'tidgi-desktop',
      timestamp: Date.now(),
      lamportClock: Date.now(),
      role: 'user',
      content: '帮我搜一下 wiki 里的笔记',
    }];

    let lastCompleteState: Record<string, unknown> | null = null;
    const obs = agentInstanceService.concatPrompt(
      { agentFrameworkConfig: mergedConfig },
      messages,
    );
    await new Promise<void>((resolve, reject) => {
      obs.subscribe({
        next: (state) => {
          if ((state as unknown as { isComplete: boolean }).isComplete) {
            lastCompleteState = state as unknown as Record<string, unknown>;
          }
        },
        error: (err) => {
          reject(err instanceof Error ? err : new Error(String(err)));
        },
        complete: () => {
          resolve();
        },
      });
    });

    expect(lastCompleteState).not.toBeNull();
    const flatPrompts = (lastCompleteState as unknown as { flatPrompts: Array<{ role: string; content: unknown }> })?.flatPrompts;
    expect(flatPrompts).toBeDefined();
    const allContent = JSON.stringify(flatPrompts);

    // Tool descriptions injected via onProcessPrompts → injectToolList
    // The tool content is generated from zod LLM schemas; verify injection happened
    expect(allContent).toContain('Available Wiki Workspaces');
    expect(allContent).toContain('## ask-question');
    expect(allContent).toContain('**Description**');
  }, 30000);
});
