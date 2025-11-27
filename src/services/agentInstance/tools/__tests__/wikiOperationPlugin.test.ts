/**
 * Tests for wikiOperationTool
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WikiChannel } from '@/constants/channels';
// matchToolCalling is used by plugin implementation; tests provide real tool_use payloads so no local mock needed
import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
// Removed logger import as it is unused

import { matchToolCalling } from '@services/agentDefinition/responsePatternUtility';
import type { IPromptConcatTool } from '@services/agentInstance/promptConcat/promptConcatSchema';
import type { IPrompt } from '@services/agentInstance/promptConcat/promptConcatSchema';
import type { AIStreamResponse } from '@services/externalAPI/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { AgentFrameworkContext } from '../../agentFrameworks/utilities/type';
import type { AgentInstance } from '../../interface';
import { createAgentFrameworkHooks } from '../index';
import type { AIResponseContext, PromptConcatHookContext, ToolActions } from '../types';
import { wikiOperationTool } from '../wikiOperation';
import { workspacesListTool } from '../workspacesList';

// Mock i18n
vi.mock('@services/libs/i18n', () => ({
  i18n: {
    t: vi.fn((key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'Tool.WikiOperation.Success.Added': '成功在Wiki工作空间"{{workspaceName}}"中添加了Tiddler"{{title}}"',
        'Tool.WikiOperation.Success.Deleted': '成功从Wiki工作空间"{{workspaceName}}"中删除了Tiddler"{{title}}"',
        'Tool.WikiOperation.Success.Updated': '成功在Wiki工作空间"{{workspaceName}}"中设置了Tiddler"{{title}}"的文本',
        'Tool.WikiOperation.Error.WorkspaceNotFound': '工作空间名称或ID"{{workspaceName}}"不存在。可用工作空间：{{availableWorkspaces}}',
        'Tool.WikiOperation.Error.WorkspaceNotExist': '工作空间{{workspaceID}}不存在',
      };

      let translation = translations[key] || key;

      // Handle interpolation
      if (options && typeof options === 'object') {
        Object.keys(options).forEach(optionKey => {
          if (optionKey !== 'ns' && optionKey !== 'defaultValue') {
            translation = translation.replace(new RegExp(`{{${optionKey}}}`, 'g'), String(options[optionKey]));
          }
        });
      }

      return translation;
    }),
  },
}));

// Helper to construct a complete AgentagentFrameworkContext for tests
const makeAgentFrameworkContext = (agentId = 'test-agent'): AgentFrameworkContext => ({
  agent: {
    id: agentId,
    agentDefId: 'test-agent-def',
    messages: [],
    status: { state: 'working', modified: new Date() },
    created: new Date(),
  } as unknown as AgentInstance,
  agentDef: { id: 'test-agent-def', name: 'test-agent-def', agentFrameworkConfig: {} } as unknown as { id: string; name: string; agentFrameworkConfig: Record<string, unknown> },
  isCancelled: () => false,
});

describe('wikiOperationTool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should inject wiki operation tool content when plugin is configured', async () => {
    const hooks = createAgentFrameworkHooks();
    // First register workspacesListTool to inject available workspaces from the global mock
    workspacesListTool(hooks);
    wikiOperationTool(hooks);

    // Start with prompts and run workspacesList injection first (toolConfig for workspacesList)
    const prompts: IPrompt[] = [
      {
        id: 'target-prompt',
        caption: 'Target Prompt',
        children: [],
      },
    ];

    const workspacesContext: PromptConcatHookContext = {
      agentFrameworkContext: {
        agent: { id: 'test-agent', messages: [], agentDefId: 'test', status: { state: 'working' as const, modified: new Date() }, created: new Date() },
        agentDef: { id: 'test', name: 'test', agentFrameworkConfig: {} },
        isCancelled: () => false,
      },
      messages: [],
      prompts,
      toolConfig: {
        id: 'workspaces-plugin',
        caption: 'Workspaces Plugin',
        forbidOverrides: false,
        toolId: 'workspacesList',
        workspacesListParam: {
          targetId: 'target-prompt',
          position: 'after' as const,
        },
      } as unknown as IPromptConcatTool,
    };

    await hooks.processPrompts.promise(workspacesContext);

    // Then run wikiOperation injection which will append its tool content to the same prompt
    const wikiOpContext: PromptConcatHookContext = {
      agentFrameworkContext: workspacesContext.agentFrameworkContext,
      messages: [],
      prompts,
      toolConfig: {
        id: 'test-plugin',
        toolId: 'wikiOperation',
        wikiOperationParam: {
          toolListPosition: {
            targetId: 'target-prompt',
            position: 'after' as const,
          },
        },
      } as unknown as IPromptConcatTool,
    };

    await hooks.processPrompts.promise(wikiOpContext);

    const targetPrompt = prompts[0];
    // workspacesListTool and wikiOperationTool may both add children; assert the combined children text contains expected snippets
    const childrenText = JSON.stringify(targetPrompt.children);
    expect(childrenText).toContain('wiki-operation');
    // Ensure the injected tool content documents the supported operations (enum values)
    expect(childrenText).toContain(WikiChannel.addTiddler);
    expect(childrenText).toContain(WikiChannel.setTiddlerText);
    expect(childrenText).toContain(WikiChannel.deleteTiddler);
    // Ensure required parameter keys are present in the documentation
    expect(childrenText).toContain('workspaceName');
    expect(childrenText).toContain('operation');
    expect(childrenText).toContain('title');
    expect(childrenText).toContain('text');
    expect(childrenText).toContain('extraMeta');
    expect(childrenText).toContain('options');
  });

  describe('tool execution', () => {
    it('should execute create operation successfully', async () => {
      const hooks = createAgentFrameworkHooks();
      wikiOperationTool(hooks);

      const agentFrameworkContext = makeAgentFrameworkContext();

      const context = {
        agentFrameworkContext,
        agentFrameworkConfig: {
          plugins: [
            {
              toolId: 'wikiOperation',
              wikiOperationParam: {
                toolResultDuration: 1,
              },
            },
          ],
        },
        response: {
          status: 'done' as const,
          content: 'AI response with tool call',
        },
        actions: {},
      };

      // Provide a real tool_use payload in the AI response so matchToolCalling can parse it
      const createParams = {
        workspaceName: 'Test Wiki 1',
        operation: WikiChannel.addTiddler,
        title: 'Test Note',
        text: 'Test content',
        extraMeta: JSON.stringify({ tags: ['tag1', 'tag2'] }),
        options: JSON.stringify({}),
      } as const;
      context.response.content = `<tool_use name="wiki-operation">${JSON.stringify(createParams)}</tool_use>`;

      // Add an assistant message containing the tool_use so the plugin can find it
      agentFrameworkContext.agent.messages.push({
        id: `m-${Date.now()}`,
        agentId: agentFrameworkContext.agent.id,
        role: 'assistant',
        content: context.response.content,
        modified: new Date(),
      });

      // Sanity-check real parser before invoking plugin hook
      const parseCheck = matchToolCalling(context.response.content);
      expect(parseCheck.found).toBe(true);
      expect((parseCheck.parameters as Record<string, unknown>).workspaceName).toBe('Test Wiki 1');
      expect((parseCheck.parameters as Record<string, unknown>).operation).toBe(WikiChannel.addTiddler);
      expect((parseCheck.parameters as Record<string, unknown>).title).toBe('Test Note');

      // Verify workspace service returns expected workspaces
      const workspaceService = container.get<Partial<IWorkspaceService>>(serviceIdentifier.Workspace);
      const wsList = await workspaceService.getWorkspacesAsList!();
      expect(wsList.some(w => w.name === 'Test Wiki 1' || w.id === 'Test Wiki 1')).toBe(true);

      // Ensure the wiki service resolved from the container has the wikiOperationInServer method
      const wikiSvc = container.get<Partial<IWikiService>>(serviceIdentifier.Wiki);
      expect(wikiSvc.wikiOperationInServer).toBeDefined();
      expect(typeof wikiSvc.wikiOperationInServer).toBe('function');

      const responseCtx: AIResponseContext = {
        agentFrameworkContext,
        toolConfig: context.agentFrameworkConfig?.plugins?.[0] as unknown as IPromptConcatTool,
        agentFrameworkConfig: context.agentFrameworkConfig as { plugins?: Array<{ toolId: string; [key: string]: unknown }> },
        response: { requestId: 'r-create', content: context.response.content, status: 'done' } as AIStreamResponse,
        requestId: 'r-create',
        isFinal: true,
        actions: {} as ToolActions,
      };

      await hooks.responseComplete.promise(responseCtx);

      expect(container.get<Partial<IWikiService>>(serviceIdentifier.Wiki).wikiOperationInServer).toHaveBeenCalledWith(
        WikiChannel.addTiddler,
        'test-wiki-1',
        ['Test Note', 'Test content', '{"tags":["tag1","tag2"]}', '{"withDate":true}'],
      );

      // Verify a tool result message was added to agent history
      const toolResultMessage = agentFrameworkContext.agent.messages.find(m => m.metadata?.isToolResult);
      expect(toolResultMessage).toBeTruthy();
      expect(toolResultMessage?.content).toContain('<functions_result>');
      // Check for general success wording and tiddler title
      expect(toolResultMessage?.content).toContain('成功在Wiki工作空间');
      expect(toolResultMessage?.content).toContain('Test Note');
      expect(toolResultMessage?.metadata?.isToolResult).toBe(true);
      expect(toolResultMessage?.metadata?.toolId).toBe('wiki-operation');
    });

    it('should execute update operation successfully', async () => {
      const hooks = createAgentFrameworkHooks();
      wikiOperationTool(hooks);

      const agentFrameworkContext = makeAgentFrameworkContext();

      const context = {
        agentFrameworkContext,
        agentFrameworkConfig: {
          plugins: [{ toolId: 'wikiOperation', wikiOperationParam: {} }],
        },
        response: {
          status: 'done' as const,
          content: 'AI response with tool call',
        },
        actions: {},
      };

      // Add assistant message so plugin can detect the tool call
      agentFrameworkContext.agent.messages.push({
        id: `m-${Date.now()}`,
        agentId: agentFrameworkContext.agent.id,
        role: 'assistant',
        content: context.response.content,
        modified: new Date(),
      });

      // Use an actual tool_use payload for update
      const updateParams = {
        workspaceName: 'Test Wiki 1',
        operation: WikiChannel.setTiddlerText,
        title: 'Existing Note',
        text: 'Updated content',
      } as const;
      context.response.content = `<tool_use name="wiki-operation">${JSON.stringify(updateParams)}</tool_use>`;

      const respCtx2: AIResponseContext = {
        agentFrameworkContext,
        toolConfig: context.agentFrameworkConfig?.plugins?.[0] as unknown as IPromptConcatTool,
        agentFrameworkConfig: context.agentFrameworkConfig as { plugins?: Array<{ toolId: string; [key: string]: unknown }> },
        response: { requestId: 'r-update', content: context.response.content, status: 'done' } as AIStreamResponse,
        actions: {} as ToolActions,
        requestId: 'r-update',
        isFinal: true,
      };
      await hooks.responseComplete.promise(respCtx2);

      expect(container.get<Partial<IWikiService>>(serviceIdentifier.Wiki).wikiOperationInServer).toHaveBeenCalledWith(
        WikiChannel.setTiddlerText,
        'test-wiki-1',
        ['Existing Note', 'Updated content'],
      );

      // Check general update success wording and tiddler title
      const updateResult = agentFrameworkContext.agent.messages.find(m => m.metadata?.isToolResult);
      expect(updateResult).toBeTruthy();
      expect(updateResult?.content).toContain('成功在Wiki工作空间');
      expect(updateResult?.content).toContain('Existing Note');
    });

    it('should execute delete operation successfully', async () => {
      const hooks = createAgentFrameworkHooks();
      wikiOperationTool(hooks);

      const agentFrameworkContext = makeAgentFrameworkContext();

      const context = {
        agentFrameworkContext,
        agentFrameworkConfig: {
          plugins: [{ toolId: 'wikiOperation', wikiOperationParam: {} }],
        },
        response: {
          status: 'done' as const,
          content: 'AI response with tool call',
        },
        actions: {},
      };

      // Add assistant message so plugin can detect the tool call
      agentFrameworkContext.agent.messages.push({
        id: `m-${Date.now()}`,
        agentId: agentFrameworkContext.agent.id,
        role: 'assistant',
        content: context.response.content,
        modified: new Date(),
      });

      // Use an actual tool_use payload for delete
      const deleteParams = {
        workspaceName: 'Test Wiki 1',
        operation: WikiChannel.deleteTiddler,
        title: 'Note to Delete',
      } as const;
      context.response.content = `<tool_use name="wiki-operation">${JSON.stringify(deleteParams)}</tool_use>`;

      const respCtx3: AIResponseContext = {
        agentFrameworkContext,
        toolConfig: context.agentFrameworkConfig?.plugins?.[0] as unknown as IPromptConcatTool,
        agentFrameworkConfig: context.agentFrameworkConfig as { plugins?: Array<{ toolId: string; [key: string]: unknown }> },
        response: { requestId: 'r-delete', content: context.response.content, status: 'done' } as AIStreamResponse,
        actions: {} as ToolActions,
        requestId: 'r-delete',
        isFinal: true,
      };
      await hooks.responseComplete.promise(respCtx3);

      expect(container.get<Partial<IWikiService>>(serviceIdentifier.Wiki).wikiOperationInServer).toHaveBeenCalledWith(
        WikiChannel.deleteTiddler,
        'test-wiki-1',
        ['Note to Delete'],
      );

      const deleteResult = agentFrameworkContext.agent.messages.find(m => m.metadata?.isToolResult);
      expect(deleteResult).toBeTruthy();
      expect(deleteResult?.content).toContain('成功从Wiki工作空间');
    });

    it('should handle workspace not found error', async () => {
      const hooks = createAgentFrameworkHooks();
      wikiOperationTool(hooks);

      // Use an actual tool_use payload with a nonexistent workspace
      const agentFrameworkContext = makeAgentFrameworkContext();

      const context = {
        agentFrameworkContext,
        agentFrameworkConfig: {
          plugins: [{ toolId: 'wikiOperation', wikiOperationParam: {} }],
        },
        response: {
          status: 'done',
          content: 'AI response with tool call',
        },
        actions: {},
      };

      // Add assistant message so plugin can detect the tool call
      agentFrameworkContext.agent.messages.push({
        id: `m-${Date.now()}`,
        agentId: agentFrameworkContext.agent.id,
        role: 'assistant',
        content: context.response.content,
        modified: new Date(),
      });

      const badParams = {
        workspaceName: 'Non-existent Wiki',
        operation: WikiChannel.addTiddler,
        title: 'Test Note',
      } as const;
      context.response.content = `<tool_use name="wiki-operation">${JSON.stringify(badParams)}</tool_use>`;

      const respCtx4: AIResponseContext = {
        agentFrameworkContext,
        toolConfig: context.agentFrameworkConfig?.plugins?.[0] as unknown as IPromptConcatTool,
        agentFrameworkConfig: context.agentFrameworkConfig as { plugins?: Array<{ toolId: string; [key: string]: unknown }> },
        response: { requestId: 'r-error', content: context.response.content, status: 'done' } as AIStreamResponse,
        actions: {} as ToolActions,
        requestId: 'r-error',
        isFinal: true,
      };
      await hooks.responseComplete.promise(respCtx4);

      const errResult = agentFrameworkContext.agent.messages.find(m => m.metadata?.isToolResult);
      expect(errResult).toBeTruthy();
      expect(errResult?.content).toContain('工作空间名称或ID');
      // Ensure control is yielded to self on error so AI gets the next round
      expect(respCtx4.actions?.yieldNextRoundTo).toBe('self');
    });

    it('should not execute when tool call is not found', async () => {
      const hooks = createAgentFrameworkHooks();
      wikiOperationTool(hooks);

      // No tool_use in response

      const agentFrameworkContext = makeAgentFrameworkContext();

      const context = {
        agentFrameworkContext,
        agentFrameworkConfig: {
          plugins: [{ toolId: 'wikiOperation', wikiOperationParam: {} }],
        },
        response: {
          status: 'done' as const,
          content: 'AI response without tool call',
        },
        actions: {},
      };

      await hooks.responseComplete.promise({
        agentFrameworkContext,
        toolConfig: context.agentFrameworkConfig?.plugins?.[0] as unknown as IPromptConcatTool,
        agentFrameworkConfig: context.agentFrameworkConfig as { plugins?: Array<{ toolId: string; [key: string]: unknown }> },
        response: { requestId: 'r-none', content: context.response.content, status: 'done' } as AIStreamResponse,
        actions: {} as ToolActions,
        requestId: 'r-none',
        isFinal: true,
      });

      const wikiLocalAssert = container.get<Partial<IWikiService>>(serviceIdentifier.Wiki);
      expect(wikiLocalAssert.wikiOperationInServer).not.toHaveBeenCalled();
      expect(agentFrameworkContext.agent.messages).toHaveLength(0);
    });
  });
});
