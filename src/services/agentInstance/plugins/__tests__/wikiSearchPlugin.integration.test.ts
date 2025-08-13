/**
 * Integration tests for wikiSearchPlugin with messageManagementPlugin
 * Tests the complete flow from tool calling to message persistence
 */
import { WikiChannel } from '@/constants/channels';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import serviceIdentifier from '@services/serviceIdentifier';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import defaultAgents from '../../buildInAgentHandlers/defaultAgents.json';
import type { AgentInstanceMessage } from '../../interface';

// Mock dependencies
const mockWikiService = {
  wikiOperationInServer: vi.fn(),
};

const mockWorkspaceService = {
  getWorkspacesAsList: vi.fn(),
  exists: vi.fn(),
};

vi.mock('@services/container', () => ({
  container: {
    get: vi.fn((identifier: symbol) => {
      if (identifier === serviceIdentifier.Wiki) {
        return mockWikiService;
      }
      if (identifier === serviceIdentifier.Workspace) {
        return mockWorkspaceService;
      }
      if (identifier === serviceIdentifier.AgentInstance) {
        return realAgentInstanceService;
      }
      return {};
    }),
  },
}));

// Import plugins after mocks
import { createHandlerHooks } from '../index';
import { messageManagementPlugin } from '../messageManagementPlugin';
import type { AIResponseContext } from '../types';
import { wikiSearchPlugin } from '../wikiSearchPlugin';

let dataSource: DataSource;
let testAgentId: string;
let realAgentInstanceService: {
  saveUserMessage: (message: AgentInstanceMessage) => Promise<void>;
  debounceUpdateMessage: (message: AgentInstanceMessage, agentId?: string) => void;
  updateAgent: (agentId: string, updates: Record<string, unknown>) => Promise<void>;
};

const exampleAgent = defaultAgents[0];

describe('Wiki Search Plugin Integration - Full Message Persistence Flow', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    testAgentId = `test-agent-${Date.now()}`;

    // Create in-memory SQLite database
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity],
      synchronize: true,
      logging: false,
    });

    await dataSource.initialize();

    // Create test data
    const agentDefRepo = dataSource.getRepository(AgentDefinitionEntity);
    await agentDefRepo.save({
      id: exampleAgent.id,
      name: exampleAgent.name,
    });

    const agentRepo = dataSource.getRepository(AgentInstanceEntity);
    await agentRepo.save({
      id: testAgentId,
      agentDefId: exampleAgent.id,
      name: `Instance of ${exampleAgent.name}`,
      status: { state: 'working', modified: new Date() },
      created: new Date(),
      closed: false,
    });

    // Create real agent instance service
    realAgentInstanceService = {
      saveUserMessage: vi.fn(async (message: AgentInstanceMessage) => {
        const messageRepo = dataSource.getRepository(AgentInstanceMessageEntity);
        await messageRepo.save({
          id: message.id,
          agentId: message.agentId,
          role: message.role,
          content: message.content,
          contentType: message.contentType || 'text/plain',
          modified: message.modified || new Date(),
          metadata: message.metadata,
          duration: message.duration ?? undefined,
        });
      }),
      debounceUpdateMessage: vi.fn(),
      updateAgent: vi.fn(),
    };

    // Setup workspace and wiki mocks
    mockWorkspaceService.getWorkspacesAsList.mockResolvedValue([
      {
        id: 'test-wiki-1',
        name: 'Test Wiki 1',
        wikiFolderLocation: '/path/to/test-wiki-1',
        homeUrl: 'http://localhost:5212/',
        port: 5212,
        isSubWiki: false,
        mainWikiToLink: undefined,
        tagName: '',
        lastUrl: '',
        active: true,
        hibernated: false,
        order: 0,
        disableNotifications: false,
        badgeCount: 0,
        type: 'wiki' as const,
      },
    ]);
    mockWorkspaceService.exists.mockResolvedValue(true);

    mockWikiService.wikiOperationInServer.mockImplementation((channel: WikiChannel, _workspaceId: string, args: string[]) => {
      if (channel === WikiChannel.runFilter) {
        return Promise.resolve(['Index', 'Home']);
      }
      if (channel === WikiChannel.getTiddlersAsJson) {
        const title = args[0];
        return Promise.resolve([
          {
            title,
            text: `Content of ${title}: Important navigation page`,
            tags: ['navigation'],
          },
        ]);
      }
      return Promise.resolve([]);
    });
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  const createHandlerContext = (messages: AgentInstanceMessage[] = []) => ({
    agent: {
      id: testAgentId,
      agentDefId: exampleAgent.id,
      status: { state: 'working' as const, modified: new Date() },
      created: new Date(),
      messages,
    },
    agentDef: {
      id: exampleAgent.id,
      name: exampleAgent.name,
      version: '1.0.0',
      capabilities: [],
      handlerConfig: exampleAgent.handlerConfig,
    },
    isCancelled: () => false,
  });

  it('should complete the full wiki search flow with proper message persistence', async () => {
    // Create integrated hooks with both plugins
    const hooks = createHandlerHooks();
    wikiSearchPlugin(hooks);
    messageManagementPlugin(hooks);

    const handlerContext = createHandlerContext();

    // First, add the AI tool call message to the context (simulating what would happen in responseComplete)
    const aiToolCallMessage: AgentInstanceMessage = {
      id: 'ai-tool-call-1',
      agentId: testAgentId,
      role: 'assistant',
      content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[title[Index]]", "maxResults": 5}</tool_use>',
      modified: new Date(),
      metadata: { isComplete: true },
      duration: 1,
    };
    handlerContext.agent.messages.push(aiToolCallMessage);

    // Step 1: AI generates tool call response
    const aiToolCallResponse = {
      status: 'done' as const,
      content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[title[Index]]", "maxResults": 5}</tool_use>',
      requestId: 'test-request-123',
    };

    const responseContext: AIResponseContext = {
      handlerContext,
      response: aiToolCallResponse,
      requestId: 'test-request-123',
      isFinal: true,
      actions: {},
      pluginConfig: {
        id: 'test-wiki-search',
        pluginId: 'wikiSearch',
        wikiSearchParam: {
          toolResultDuration: 1,
        },
      } as any, // Type assertion for test compatibility
    };

    // Step 2: Execute wikiSearch responseComplete hook
    await hooks.responseComplete.promise(responseContext);

    // Verify that tool result message was added to context
    // Note: messageManagementPlugin may also create an AI response message, so expect 3 messages total
    expect(handlerContext.agent.messages.length).toBeGreaterThanOrEqual(2);
    
    // Find the tool result message
    const toolResultMessage = handlerContext.agent.messages.find(m => m.metadata?.isToolResult);
    expect(toolResultMessage).toBeDefined();
    expect(toolResultMessage!.role).toBe('assistant'); // Should be 'assistant', not 'user'
    expect(toolResultMessage!.content).toContain('<functions_result>');
    expect(toolResultMessage!.content).toContain('Tool: wiki-search');
    expect(toolResultMessage!.content).toContain('Index');
    expect(toolResultMessage!.metadata?.isToolResult).toBe(true);
    expect(toolResultMessage!.metadata?.isPersisted).toBe(true); // Should be true after toolExecuted hook

    // Step 3: Verify tool persistence was triggered via toolExecuted hook
    // This should have been called by wikiSearchPlugin
    expect(realAgentInstanceService.saveUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: expect.stringContaining('<functions_result>'),
        metadata: expect.objectContaining({
          isToolResult: true,
          toolId: 'wiki-search',
        }),
      }),
    );

    // Step 4: Verify tool result message is now marked as persisted
    expect(toolResultMessage!.metadata?.isPersisted).toBe(true); // Already true after toolExecuted hook

    // Step 5: Verify tool result was actually saved to database
    const messageRepo = dataSource.getRepository(AgentInstanceMessageEntity);
    const savedMessages = await messageRepo.find({
      where: { agentId: testAgentId },
    });

    expect(savedMessages.length).toBeGreaterThanOrEqual(1); // At least tool result should be saved
    const savedToolResult = savedMessages.find(m => m.metadata?.isToolResult);
    expect(savedToolResult).toBeTruthy();
    expect(savedToolResult?.role).toBe('assistant');
    expect(savedToolResult?.content).toContain('<functions_result>');
    expect(savedToolResult?.metadata?.toolId).toBe('wiki-search');

    // Step 6: Simulate page refresh - reload from database
    const reloadedMessages = await messageRepo.find({
      where: { agentId: testAgentId },
      order: { modified: 'ASC' },
    });

    expect(reloadedMessages.length).toBeGreaterThanOrEqual(1);
    const toolResultFromDb = reloadedMessages.find(m => m.metadata?.isToolResult);
    expect(toolResultFromDb).toBeTruthy();
    expect(toolResultFromDb!.content).toContain('<functions_result>');
    expect(toolResultFromDb!.role).toBe('assistant');
    
    // This verifies the fix: tool results are now persisted and retrievable after page refresh
  });

  it('should handle wiki search errors and persist error messages correctly', async () => {
    const hooks = createHandlerHooks();
    wikiSearchPlugin(hooks);
    messageManagementPlugin(hooks);

    const handlerContext = createHandlerContext();

    // Add AI tool call message first
    const aiToolCallMessage: AgentInstanceMessage = {
      id: 'ai-tool-call-error',
      agentId: testAgentId,
      role: 'assistant',
      content: '<tool_use name="wiki-search">{"workspaceName": "Nonexistent Wiki", "filter": "[title[Index]]"}</tool_use>',
      modified: new Date(),
      metadata: { isComplete: true },
      duration: 1,
    };
    handlerContext.agent.messages.push(aiToolCallMessage);

    // Create response with invalid workspace
    const aiToolCallResponse = {
      status: 'done' as const,
      content: '<tool_use name="wiki-search">{"workspaceName": "Nonexistent Wiki", "filter": "[title[Index]]"}</tool_use>',
      requestId: 'test-request-error',
    };

    const responseContext: AIResponseContext = {
      handlerContext,
      response: aiToolCallResponse,
      requestId: 'test-request-error',
      isFinal: true,
      actions: {},
      pluginConfig: {
        id: 'test-wiki-search',
        pluginId: 'wikiSearch',
        wikiSearchParam: {
          toolResultDuration: 1,
        },
      } as any, // Type assertion for test compatibility
    };

    await hooks.responseComplete.promise(responseContext);

    // Verify error message was created and persisted
    expect(handlerContext.agent.messages.length).toBeGreaterThanOrEqual(2);
    
    // Find the error result message
    const errorMessage = handlerContext.agent.messages.find(m => m.metadata?.isToolResult && m.metadata.isError);
    expect(errorMessage).toBeDefined();
    expect(errorMessage!.role).toBe('assistant');
    expect(errorMessage!.content).toContain('<functions_result>');
    expect(errorMessage!.content).toContain('Error:');
    expect(errorMessage!.content).toContain('does not exist');
    expect(errorMessage!.metadata?.isToolResult).toBe(true);
    expect(errorMessage!.metadata?.isError).toBe(true);
    expect(errorMessage!.metadata?.isPersisted).toBe(true);

    // Verify error was saved to database
    const messageRepo = dataSource.getRepository(AgentInstanceMessageEntity);
    const savedMessages = await messageRepo.find({
      where: { agentId: testAgentId },
    });

    expect(savedMessages.length).toBeGreaterThanOrEqual(1);
    const savedError = savedMessages.find(m => m.metadata?.isError);
    expect(savedError).toBeTruthy();
    expect(savedError?.role).toBe('assistant');
    expect(savedError?.content).toContain('Error:');
    expect(savedError?.metadata?.isError).toBe(true);
  });

  it('should maintain correct message ordering and timestamps', async () => {
    const hooks = createHandlerHooks();
    wikiSearchPlugin(hooks);
    messageManagementPlugin(hooks);

    const handlerContext = createHandlerContext();

    // Add a user message first
    const userMessage: AgentInstanceMessage = {
      id: 'user-msg-1',
      agentId: testAgentId,
      role: 'user',
      content: '搜索 wiki 中的 Index 条目',
      modified: new Date(Date.now() - 1000), // 1 second ago
      duration: undefined,
    };
    await realAgentInstanceService.saveUserMessage(userMessage);

    // Add AI tool call message
    const aiToolCallMessage: AgentInstanceMessage = {
      id: 'ai-tool-call-1',
      agentId: testAgentId,
      role: 'assistant',
      content: '<tool_use name="wiki-search">{"workspaceName": "Test Wiki 1", "filter": "[title[Index]]"}</tool_use>',
      modified: new Date(Date.now() - 500), // 500ms ago
      duration: 1,
      metadata: { isComplete: true, containsToolCall: true, toolId: 'wiki-search' },
    };
    await realAgentInstanceService.saveUserMessage(aiToolCallMessage);

    // Execute tool search
    const responseContext: AIResponseContext = {
      handlerContext,
      response: {
        status: 'done',
        content: aiToolCallMessage.content,
        requestId: 'test-request-timing',
      },
      requestId: 'test-request-timing',
      isFinal: true,
      actions: {},
      pluginConfig: {
        id: 'test-wiki-search',
        pluginId: 'wikiSearch',
        wikiSearchParam: {
          toolResultDuration: 1,
        },
      } as any, // Type assertion for test compatibility
    };

    await hooks.responseComplete.promise(responseContext);

    // Verify message ordering in database
    const messageRepo = dataSource.getRepository(AgentInstanceMessageEntity);
    const allMessages = await messageRepo.find({
      where: { agentId: testAgentId },
      order: { modified: 'ASC' },
    });

    expect(allMessages.length).toBeGreaterThanOrEqual(3); // At least user + ai tool call + tool result
    expect(allMessages[0].content).toContain('搜索 wiki 中的 Index 条目'); // user message
    expect(allMessages[1].content).toContain('<tool_use name="wiki-search">'); // ai tool call
    
    // Find tool result message in database
    const toolResultInDb = allMessages.find(m => m.metadata?.isToolResult);
    expect(toolResultInDb).toBeDefined();
    expect(toolResultInDb!.content).toContain('<functions_result>'); // tool result

    // Verify tool result has later timestamp
    expect(toolResultInDb!.modified).toBeDefined();
    expect(allMessages[1].modified).toBeDefined();
    expect(toolResultInDb!.modified!.getTime()).toBeGreaterThan(allMessages[1].modified!.getTime());
    expect(toolResultInDb!.role).toBe('assistant');
  });
});
