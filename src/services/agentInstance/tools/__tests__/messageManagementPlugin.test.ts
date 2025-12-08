/**
 * Deep integration tests for messageManagementTool with real SQLite database
 * Tests actual message persistence scenarios using taskAgents.json configuration
 */
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import serviceIdentifier from '@services/serviceIdentifier';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import defaultAgents from '../../agentFrameworks/taskAgents.json';
import type { AgentInstanceMessage, IAgentInstanceService } from '../../interface';
import { registerCoreInfrastructure } from '../../promptConcat/infrastructure';
import { createAgentFrameworkHooks } from '../index';
import type { ToolExecutionContext, UserMessageContext } from '../types';

// Use the real agent config from taskAgents.json
const exampleAgent = defaultAgents[0];

describe('Message Management Plugin - Real Database Integration', () => {
  let testAgentId: string;
  // agentInstanceServiceImpl available to test blocks
  let agentInstanceServiceImpl: IAgentInstanceService;
  let hooks: ReturnType<typeof createAgentFrameworkHooks>;
  let realDataSource: DataSource;

  beforeEach(async () => {
    vi.clearAllMocks();
    testAgentId = `test-agent-${Date.now()}`;

    // Ensure DatabaseService is initialized with all schemas
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    await databaseService.initializeForApp();

    // Get the real agent database
    realDataSource = await databaseService.getDatabase('agent');

    // Clean up in correct order to avoid foreign key constraints
    const messageRepo = realDataSource.getRepository(AgentInstanceMessageEntity);
    const agentRepo = realDataSource.getRepository(AgentInstanceEntity);
    const agentDefRepo = realDataSource.getRepository(AgentDefinitionEntity);

    // Clear dependent tables first
    await messageRepo.clear();
    await agentRepo.clear();
    await agentDefRepo.clear();

    // Create test data using defaultAgent structure
    await agentDefRepo.save({
      id: exampleAgent.id,
      name: exampleAgent.name,
    });

    await agentRepo.save({
      id: testAgentId,
      agentDefId: exampleAgent.id,
      name: `Instance of ${exampleAgent.name}`,
      status: { state: 'working', modified: new Date() },
      created: new Date(),
      closed: false,
    });

    // Use globally bound AgentInstanceService (configured in src/__tests__/setup-vitest.ts)
    // Make sure Database.getDatabase returns our real dataSource
    databaseService.getDatabase = vi.fn().mockResolvedValue(realDataSource);

    agentInstanceServiceImpl = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    // Initialize AgentInstanceService so repositories are set
    await agentInstanceServiceImpl.initialize();

    // Initialize plugin
    hooks = createAgentFrameworkHooks();
    registerCoreInfrastructure(hooks);
  });

  afterEach(async () => {
    // Clean up is handled automatically by beforeEach for each test
  });

  const createAgentFrameworkContext = (messages: AgentInstanceMessage[] = []) => ({
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
      agentFrameworkConfig: exampleAgent.agentFrameworkConfig,
    },
    isCancelled: () => false,
  });

  describe('Real Wiki Search Scenario - The Missing Tool Result Bug', () => {
    it('should persist all messages in wiki search flow: user query → AI tool call → tool result → AI final response', async () => {
      const agentFrameworkContext = createAgentFrameworkContext();

      // Step 1: User asks to search wiki
      const userMessageId = `user-msg-${Date.now()}`;
      const userContext: UserMessageContext = {
        agentFrameworkContext,
        content: { text: '搜索 wiki 中的 Index 条目并解释' },
        messageId: userMessageId,
        timestamp: new Date(),
      };

      await hooks.userMessageReceived.promise(userContext);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify user message was saved
      let messageRepo = realDataSource.getRepository(AgentInstanceMessageEntity);
      let allMessages = await messageRepo.find({
        where: { agentId: testAgentId },
      });
      expect(allMessages).toHaveLength(1);
      expect(allMessages[0].content).toBe('搜索 wiki 中的 Index 条目并解释');
      expect(allMessages[0].role).toBe('user');

      // Step 2: AI generates tool call (this gets persisted via responseComplete)
      const aiToolCallMessage: AgentInstanceMessage = {
        id: `ai-tool-call-${Date.now()}`,
        agentId: testAgentId,
        role: 'assistant',
        content: '<tool_use name="wiki-search">{ "workspaceName": "wiki", "filter": "[title[Index]]" }</tool_use>',
        contentType: 'text/plain',
        modified: new Date(),
        metadata: { isComplete: true },
        duration: undefined,
      };

      await agentInstanceServiceImpl.saveUserMessage(aiToolCallMessage);
      agentFrameworkContext.agent.messages.push(aiToolCallMessage);

      // Step 3: Tool result message (THIS IS THE MISSING PIECE!)
      // This simulates what wikiSearchTool does when tool execution completes
      const toolResultMessage: AgentInstanceMessage = {
        id: `tool-result-${Date.now()}`,
        agentId: testAgentId,
        role: 'assistant', // Changed from 'user' to 'assistant' to match the fix
        content: `<functions_result>
Tool: wiki-search
Result: 在wiki中找到了名为"Index"的条目。这个条目包含以下内容：

# Index
这是wiki的索引页面，包含了所有重要条目的链接和分类。主要分为以下几个部分：
- 技术文档
- 教程指南  
- 常见问题
- 更新日志

该条目创建于2024年，是导航整个wiki内容的重要入口页面。
</functions_result>`,
        contentType: 'text/plain',
        modified: new Date(),
        metadata: {
          isToolResult: true,
          toolId: 'wiki-search',
          isPersisted: false, // Key: starts as false, should be marked true after persistence
        },
        duration: 10, // Tool results might have expiration
      };

      // Add tool result to agent messages (simulating what wikiSearchTool does)
      agentFrameworkContext.agent.messages.push(toolResultMessage);

      const toolContext: ToolExecutionContext = {
        agentFrameworkContext,
        toolResult: {
          success: true,
          data: 'Wiki search completed successfully',
          metadata: { duration: 1500 },
        },
        toolInfo: {
          toolId: 'wiki-search',
          parameters: { workspaceName: 'wiki', filter: '[title[Index]]' },
        },
      };

      // This should trigger the toolExecuted hook that saves tool result messages
      await hooks.toolExecuted.promise(toolContext);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify tool result message was persisted
      messageRepo = realDataSource.getRepository(AgentInstanceMessageEntity);
      allMessages = await messageRepo.find({
        where: { agentId: testAgentId },
        order: { modified: 'ASC' },
      });

      expect(allMessages).toHaveLength(3); // user + ai tool call + tool result

      const savedToolResult = allMessages.find((m: AgentInstanceMessage) => m.metadata?.isToolResult);
      expect(savedToolResult).toBeTruthy();
      expect(savedToolResult?.content).toContain('<functions_result>');
      expect(savedToolResult?.content).toContain('Tool: wiki-search');
      expect(savedToolResult?.content).toContain('Index');
      expect(savedToolResult?.metadata?.toolId).toBe('wiki-search');
      expect(savedToolResult?.duration).toBe(10);

      // Verify isPersisted flag was updated
      const toolMessageInMemory = agentFrameworkContext.agent.messages.find(
        (m) => m.metadata?.isToolResult,
      );
      expect(toolMessageInMemory?.metadata?.isPersisted).toBe(true);

      // Step 4: AI final response based on tool result
      const aiFinalMessage: AgentInstanceMessage = {
        id: `ai-final-${Date.now()}`,
        agentId: testAgentId,
        role: 'assistant',
        content:
          '在wiki中找到了名为"Index"的条目。这个条目包含以下内容：\n\n# Index\n这是wiki的索引页面，包含了所有重要条目的链接和分类。主要分为以下几个部分：\n- 技术文档\n- 教程指南\n- 常见问题\n- 更新日志\n\n该条目创建于2024年，是导航整个wiki内容的重要入口页面。这个Index条目作为整个wiki的导航中心，为用户提供了便捷的内容访问入口。',
        contentType: 'text/plain',
        modified: new Date(),
        metadata: { isComplete: true },
        duration: undefined,
      };

      await agentInstanceServiceImpl.saveUserMessage(aiFinalMessage);

      // Final verification: All 4 messages should be in database
      messageRepo = realDataSource.getRepository(AgentInstanceMessageEntity);
      allMessages = await messageRepo.find({
        where: { agentId: testAgentId },
        order: { modified: 'ASC' },
      });

      expect(allMessages).toHaveLength(4);

      // Verify the complete flow
      expect(allMessages[0].role).toBe('user'); // User query
      expect(allMessages[0].content).toBe('搜索 wiki 中的 Index 条目并解释');

      expect(allMessages[1].role).toBe('assistant'); // AI tool call
      expect(allMessages[1].content).toContain('<tool_use name="wiki-search">');

      expect(allMessages[2].role).toBe('assistant'); // Tool result (changed from 'user' to 'assistant')
      expect(allMessages[2].content).toContain('<functions_result>');
      expect(allMessages[2].metadata?.isToolResult).toBe(true);

      expect(allMessages[3].role).toBe('assistant'); // AI final response
      expect(allMessages[3].content).toContain(
        '在wiki中找到了名为"Index"的条目',
      );
    });

    it('should handle multiple tool results in one execution', async () => {
      const agentFrameworkContext = createAgentFrameworkContext();

      // Add multiple tool result messages
      const toolResult1: AgentInstanceMessage = {
        id: `tool-result-1-${Date.now()}`,
        agentId: testAgentId,
        role: 'assistant', // Changed from 'user' to 'assistant'
        content: '<functions_result>Tool: wiki-search\nResult: Found Index page</functions_result>',
        contentType: 'text/plain',
        modified: new Date(),
        metadata: {
          isToolResult: true,
          toolId: 'wiki-search',
          isPersisted: false,
        },
        duration: 5,
      };

      const toolResult2: AgentInstanceMessage = {
        id: `tool-result-2-${Date.now()}`,
        agentId: testAgentId,
        role: 'assistant', // Changed from 'user' to 'assistant'
        content: '<functions_result>Tool: wiki-search\nResult: Found related pages</functions_result>',
        contentType: 'text/plain',
        modified: new Date(),
        metadata: {
          isToolResult: true,
          toolId: 'wiki-search',
          isPersisted: false,
        },
        duration: 3,
      };

      agentFrameworkContext.agent.messages.push(toolResult1, toolResult2);

      const toolContext: ToolExecutionContext = {
        agentFrameworkContext,
        toolResult: {
          success: true,
          data: 'Multiple tool search completed',
        },
        toolInfo: {
          toolId: 'wiki-search',
          parameters: { workspaceName: 'wiki' },
        },
      };

      await hooks.toolExecuted.promise(toolContext);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify both tool results were persisted
      const messageRepo = realDataSource.getRepository(AgentInstanceMessageEntity);
      const allMessages = await messageRepo.find({
        where: { agentId: testAgentId },
      });

      expect(allMessages).toHaveLength(2);
      expect(allMessages.every((m: AgentInstanceMessage) => m.metadata?.isToolResult)).toBe(true);
      expect(allMessages.every((m: AgentInstanceMessage) => m.role === 'assistant')).toBe(true); // Changed from 'user' to 'assistant'

      // Verify both messages marked as persisted
      expect(toolResult1.metadata?.isPersisted).toBe(true);
      expect(toolResult2.metadata?.isPersisted).toBe(true);
    });

    it('should maintain message integrity when reloading from database (simulating page refresh)', async () => {
      // This test simulates the issue where tool results are missing after page refresh
      const agentFrameworkContext = createAgentFrameworkContext();

      // Step 1: Complete chat flow with user message → AI tool call → tool result → AI response
      const userMessage: AgentInstanceMessage = {
        id: `user-${Date.now()}`,
        agentId: testAgentId,
        role: 'user',
        content: '搜索 wiki 中的 Index 条目并解释',
        contentType: 'text/plain',
        modified: new Date(),
        metadata: { processed: true },
        duration: undefined,
      };

      const aiToolCallMessage: AgentInstanceMessage = {
        id: `ai-tool-call-${Date.now()}`,
        agentId: testAgentId,
        role: 'assistant',
        content: '<tool_use name="wiki-search">{"workspaceName": "wiki", "filter": "[title[Index]]"}</tool_use>',
        contentType: 'text/plain',
        modified: new Date(),
        metadata: { isComplete: true, containsToolCall: true, toolId: 'wiki-search' },
        duration: 1, // Tool call message expires after 1 round
      };

      const toolResultMessage: AgentInstanceMessage = {
        id: `tool-result-${Date.now()}`,
        agentId: testAgentId,
        role: 'assistant',
        content: '<functions_result>\nTool: wiki-search\nResult: Found Index page with navigation links\n</functions_result>',
        contentType: 'text/plain',
        modified: new Date(),
        metadata: {
          isToolResult: true,
          toolId: 'wiki-search',
          isPersisted: false,
        },
        duration: 1, // Tool result expires after 1 round
      };

      const aiFinalMessage: AgentInstanceMessage = {
        id: `ai-final-${Date.now()}`,
        agentId: testAgentId,
        role: 'assistant',
        content: '基于搜索结果，Index页面是wiki的主要导航入口...',
        contentType: 'text/plain',
        modified: new Date(),
        metadata: { isComplete: true },
        duration: undefined,
      };

      // Save all messages to database
      await agentInstanceServiceImpl.saveUserMessage(userMessage);
      await agentInstanceServiceImpl.saveUserMessage(aiToolCallMessage);

      // Add tool result to context and trigger persistence via toolExecuted hook
      agentFrameworkContext.agent.messages.push(toolResultMessage);
      const toolContext: ToolExecutionContext = {
        agentFrameworkContext,
        toolResult: { success: true, data: 'Search completed' },
        toolInfo: { toolId: 'wiki-search', parameters: {} },
      };
      await hooks.toolExecuted.promise(toolContext);

      await agentInstanceServiceImpl.saveUserMessage(aiFinalMessage);

      // Step 2: Simulate loading from database (page refresh scenario)
      const messageRepo = realDataSource.getRepository(AgentInstanceMessageEntity);
      const savedMessages = await messageRepo.find({
        where: { agentId: testAgentId },
        order: { modified: 'ASC' },
      });

      // Verify ALL messages were saved, including tool result
      expect(savedMessages).toHaveLength(4);

      const messageRoles = savedMessages.map((m: AgentInstanceMessage) => m.role);
      expect(messageRoles).toEqual(['user', 'assistant', 'assistant', 'assistant']);

      const messageContents = savedMessages.map((m: AgentInstanceMessage) => m.content);
      expect(messageContents[0]).toContain('搜索 wiki 中的 Index 条目');
      expect(messageContents[1]).toContain('<tool_use name="wiki-search">');
      expect(messageContents[2]).toContain('<functions_result>'); // This was missing before the fix!
      expect(messageContents[3]).toContain('基于搜索结果');

      // Verify tool result message has correct metadata
      const savedToolResult = savedMessages.find((m: AgentInstanceMessage) => m.metadata?.isToolResult);
      expect(savedToolResult).toBeTruthy();
      expect(savedToolResult?.metadata?.toolId).toBe('wiki-search');
      expect(savedToolResult?.duration).toBe(1);
      expect(savedToolResult?.role).toBe('assistant'); // Verify role is 'assistant', not 'user'

      // Step 3: Verify that the tool result message has been marked as persisted
      expect(toolResultMessage.metadata?.isPersisted).toBe(true);
    });
  });
});
