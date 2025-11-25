/**
 * Tests for workspacesListTool
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Note: global mocks from src/__tests__/setup-vitest.ts provide container and logger
import type { IPromptConcatTool } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { AgentFrameworkContext } from '../../agentFrameworks/utilities/type';
import type { AgentInstance } from '../../interface';
import type { PromptConcatHookContext } from '../types';

import type { IWorkspaceService } from '@services/workspaces/interface';
import { createAgentFrameworkHooks } from '../index';
import { workspacesListTool } from '../workspacesList';

describe('workspacesListTool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('workspaces list injection', () => {
    it('should inject workspaces list when plugin is configured', async () => {
      const hooks = createAgentFrameworkHooks();
      workspacesListTool(hooks);

      const context: PromptConcatHookContext = {
        agentFrameworkContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            messages: [],
            status: { state: 'working', modified: new Date() },
            created: new Date(),
          } as AgentInstance,
          agentDef: { id: 'test-agent-def', name: 'test-agent-def' } as unknown,
          isCancelled: () => false,
        } as AgentFrameworkContext,
        messages: [],
        prompts: [
          {
            id: 'target-prompt',
            caption: 'Target Prompt',
            children: [],
          },
        ],
        toolConfig: {
          id: 'test-plugin',
          caption: 'Test Plugin',
          forbidOverrides: false,
          toolId: 'workspacesList',
          workspacesListParam: {
            targetId: 'target-prompt',
            position: 'after' as const,
          },
        } as unknown as IPromptConcatTool,
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
      const hooks = createAgentFrameworkHooks();
      workspacesListTool(hooks);

      const context: PromptConcatHookContext = {
        agentFrameworkContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            messages: [],
            status: { state: 'working', modified: new Date() },
            created: new Date(),
          } as AgentInstance,
          agentDef: { id: 'test-agent-def', name: 'test-agent-def' } as unknown,
          isCancelled: () => false,
        } as AgentFrameworkContext,
        messages: [],
        prompts: [
          {
            id: 'target-prompt',
            caption: 'Target Prompt',
            children: [],
          },
        ],
        toolConfig: {
          id: 'test-plugin',
          caption: 'Test Plugin',
          forbidOverrides: false,
          toolId: 'workspacesList',
          workspacesListParam: {
            targetId: 'target-prompt',
            position: 'before' as const,
          },
        } as unknown as IPromptConcatTool,
      };

      await hooks.processPrompts.promise(context);

      const targetPrompt = context.prompts[0];
      expect(targetPrompt.children).toHaveLength(1);
      expect(targetPrompt.children?.[0].text).toContain('- Test Wiki 1');
      expect(targetPrompt.children?.[0].text).toContain('- Test Wiki 2');
    });

    it('should not inject content when plugin is not configured', async () => {
      const hooks = createAgentFrameworkHooks();
      workspacesListTool(hooks);

      const context: PromptConcatHookContext = {
        agentFrameworkContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            messages: [],
            status: { state: 'working', modified: new Date() },
            created: new Date(),
          } as AgentInstance,
          agentDef: { id: 'test-agent-def', name: 'test-agent-def' } as unknown,
          isCancelled: () => false,
        } as AgentFrameworkContext,
        messages: [],
        prompts: [
          {
            id: 'target-prompt',
            caption: 'Target Prompt',
            children: [],
          },
        ],
        toolConfig: { id: 'test-plugin', toolId: 'otherPlugin', forbidOverrides: false } as unknown as IPromptConcatTool,
      };

      await hooks.processPrompts.promise(context);

      const targetPrompt = context.prompts[0];
      expect(targetPrompt.children).toHaveLength(0);
    });

    it('should handle empty workspaces list', async () => {
      // Override the workspace service implementation returned by the global container mock
      const workspaceService = container.get<Partial<IWorkspaceService>>(serviceIdentifier.Workspace);
      workspaceService.getWorkspacesAsList = vi.fn().mockResolvedValue([]) as unknown as IWorkspaceService['getWorkspacesAsList'];

      const hooks = createAgentFrameworkHooks();
      workspacesListTool(hooks);

      const context: PromptConcatHookContext = {
        agentFrameworkContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            messages: [],
            status: { state: 'working', modified: new Date() },
            created: new Date(),
          } as AgentInstance,
          agentDef: { id: 'test-agent-def', name: 'test-agent-def' } as unknown,
          isCancelled: () => false,
        } as AgentFrameworkContext,
        messages: [],
        prompts: [
          {
            id: 'target-prompt',
            caption: 'Target Prompt',
            children: [],
          },
        ],
        toolConfig: {
          id: 'test-plugin',
          caption: 'Test Plugin',
          forbidOverrides: false,
          toolId: 'workspacesList',
          workspacesListParam: {
            targetId: 'target-prompt',
            position: 'after' as const,
          },
        } as unknown as IPromptConcatTool,
      };

      await hooks.processPrompts.promise(context);

      const targetPrompt = context.prompts[0];
      expect(targetPrompt.children).toHaveLength(0);
      expect(logger.debug).toHaveBeenCalledWith('No wiki workspaces found to inject', {
        toolId: 'test-plugin',
      });
    });

    it('should warn when target prompt is not found', async () => {
      const hooks = createAgentFrameworkHooks();
      workspacesListTool(hooks);

      const context: PromptConcatHookContext = {
        agentFrameworkContext: {
          agent: {
            id: 'test-agent',
            agentDefId: 'test-agent-def',
            messages: [],
            status: { state: 'working', modified: new Date() },
            created: new Date(),
          } as AgentInstance,
          agentDef: { id: 'test-agent-def', name: 'test-agent-def' } as unknown,
          isCancelled: () => false,
        } as AgentFrameworkContext,
        messages: [],
        prompts: [
          {
            id: 'different-prompt',
            caption: 'Different Prompt',
            children: [],
          },
        ],
        toolConfig: {
          id: 'test-plugin',
          caption: 'Test Plugin',
          forbidOverrides: false,
          toolId: 'workspacesList',
          workspacesListParam: {
            targetId: 'non-existent-prompt',
            position: 'after' as const,
          },
        } as unknown as IPromptConcatTool,
      };

      await hooks.processPrompts.promise(context);

      expect(logger.warn).toHaveBeenCalledWith('Workspaces list target prompt not found', {
        targetId: 'non-existent-prompt',
        toolId: 'test-plugin',
      });
    });
  });
});
