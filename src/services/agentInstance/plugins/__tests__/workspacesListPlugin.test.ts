/**
 * Tests for workspacesListPlugin
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Note: global mocks from src/__tests__/setup-vitest.ts provide container and logger
import type { IPromptConcatPlugin } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { AgentHandlerContext } from '../../buildInAgentHandlers/type';
import type { AgentInstance } from '../../interface';
import type { PromptConcatHookContext } from '../types';

import { IWorkspaceService } from '@services/workspaces/interface';
import { createHandlerHooks } from '../index';
import { workspacesListPlugin } from '../workspacesListPlugin';

describe('workspacesListPlugin', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('workspaces list injection', () => {
    it('should inject workspaces list when plugin is configured', async () => {
      const hooks = createHandlerHooks();
      workspacesListPlugin(hooks);

      const context: PromptConcatHookContext = {
        handlerContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            messages: [],
            status: { state: 'working', modified: new Date() },
            created: new Date(),
          } as AgentInstance,
          agentDef: { id: 'test-agent-def', name: 'test-agent-def' } as unknown,
          isCancelled: () => false,
        } as AgentHandlerContext,
        messages: [],
        prompts: [
          {
            id: 'target-prompt',
            caption: 'Target Prompt',
            children: [],
          },
        ],
        pluginConfig: {
          id: 'test-plugin',
          caption: 'Test Plugin',
          forbidOverrides: false,
          pluginId: 'workspacesList',
          workspacesListParam: {
            targetId: 'target-prompt',
            position: 'after' as const,
          },
        } as unknown as IPromptConcatPlugin,
      };

      await hooks.processPrompts.promise(context);

      const targetPrompt = context.prompts[0];
      expect(targetPrompt.children).toHaveLength(1);
      // Default test fixtures contain test-wiki-1 / Test Wiki 1
      expect(targetPrompt.children?.[0].text).toContain('Test Wiki 1');
      expect(targetPrompt.children?.[0].text).toContain('Test Wiki 2');
      expect(targetPrompt.children?.[0].text).toContain('test-wiki-1');
      expect(targetPrompt.children?.[0].text).toContain('test-wiki-2');
    });

    it('should inject workspaces list when position is before', async () => {
      const hooks = createHandlerHooks();
      workspacesListPlugin(hooks);

      const context: PromptConcatHookContext = {
        handlerContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            messages: [],
            status: { state: 'working', modified: new Date() },
            created: new Date(),
          } as AgentInstance,
          agentDef: { id: 'test-agent-def', name: 'test-agent-def' } as unknown,
          isCancelled: () => false,
        } as AgentHandlerContext,
        messages: [],
        prompts: [
          {
            id: 'target-prompt',
            caption: 'Target Prompt',
            children: [],
          },
        ],
        pluginConfig: {
          id: 'test-plugin',
          caption: 'Test Plugin',
          forbidOverrides: false,
          pluginId: 'workspacesList',
          workspacesListParam: {
            targetId: 'target-prompt',
            position: 'before' as const,
          },
        } as unknown as IPromptConcatPlugin,
      };

      await hooks.processPrompts.promise(context);

      const targetPrompt = context.prompts[0];
      expect(targetPrompt.children).toHaveLength(1);
      expect(targetPrompt.children?.[0].text).toContain('- Test Wiki 1');
      expect(targetPrompt.children?.[0].text).toContain('- Test Wiki 2');
    });

    it('should not inject content when plugin is not configured', async () => {
      const hooks = createHandlerHooks();
      workspacesListPlugin(hooks);

      const context: PromptConcatHookContext = {
        handlerContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            messages: [],
            status: { state: 'working', modified: new Date() },
            created: new Date(),
          } as AgentInstance,
          agentDef: { id: 'test-agent-def', name: 'test-agent-def' } as unknown,
          isCancelled: () => false,
        } as AgentHandlerContext,
        messages: [],
        prompts: [
          {
            id: 'target-prompt',
            caption: 'Target Prompt',
            children: [],
          },
        ],
        pluginConfig: { id: 'test-plugin', pluginId: 'otherPlugin', forbidOverrides: false } as unknown as IPromptConcatPlugin,
      };

      await hooks.processPrompts.promise(context);

      const targetPrompt = context.prompts[0];
      expect(targetPrompt.children).toHaveLength(0);
    });

    it('should handle empty workspaces list', async () => {
      // Override the workspace service implementation returned by the global container mock
      const workspaceService = container.get<Partial<IWorkspaceService>>(serviceIdentifier.Workspace);
      workspaceService.getWorkspacesAsList = vi.fn().mockResolvedValue([]) as unknown as IWorkspaceService['getWorkspacesAsList'];

      const hooks = createHandlerHooks();
      workspacesListPlugin(hooks);

      const context: PromptConcatHookContext = {
        handlerContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            messages: [],
            status: { state: 'working', modified: new Date() },
            created: new Date(),
          } as AgentInstance,
          agentDef: { id: 'test-agent-def', name: 'test-agent-def' } as unknown,
          isCancelled: () => false,
        } as AgentHandlerContext,
        messages: [],
        prompts: [
          {
            id: 'target-prompt',
            caption: 'Target Prompt',
            children: [],
          },
        ],
        pluginConfig: {
          id: 'test-plugin',
          caption: 'Test Plugin',
          forbidOverrides: false,
          pluginId: 'workspacesList',
          workspacesListParam: {
            targetId: 'target-prompt',
            position: 'after' as const,
          },
        } as unknown as IPromptConcatPlugin,
      };

      await hooks.processPrompts.promise(context);

      const targetPrompt = context.prompts[0];
      expect(targetPrompt.children).toHaveLength(0);
      expect(logger.debug).toHaveBeenCalledWith('No wiki workspaces found to inject', {
        pluginId: 'test-plugin',
      });
    });

    it('should warn when target prompt is not found', async () => {
      const hooks = createHandlerHooks();
      workspacesListPlugin(hooks);

      const context: PromptConcatHookContext = {
        handlerContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            messages: [],
            status: { state: 'working', modified: new Date() },
            created: new Date(),
          } as AgentInstance,
          agentDef: { id: 'test-agent-def', name: 'test-agent-def' } as unknown,
          isCancelled: () => false,
        } as AgentHandlerContext,
        messages: [],
        prompts: [
          {
            id: 'different-prompt',
            caption: 'Different Prompt',
            children: [],
          },
        ],
        pluginConfig: {
          id: 'test-plugin',
          caption: 'Test Plugin',
          forbidOverrides: false,
          pluginId: 'workspacesList',
          workspacesListParam: {
            targetId: 'non-existent-prompt',
            position: 'after' as const,
          },
        } as unknown as IPromptConcatPlugin,
      };

      await hooks.processPrompts.promise(context);

      expect(logger.warn).toHaveBeenCalledWith('Workspaces list target prompt not found', {
        targetId: 'non-existent-prompt',
        pluginId: 'test-plugin',
      });
    });
  });
});
