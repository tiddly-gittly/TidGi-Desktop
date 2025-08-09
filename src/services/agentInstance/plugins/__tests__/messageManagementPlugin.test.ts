/**
 * Deep integration tests for messageManagementPlugin with real SQLite database
 * Tests actual message persistence scenarios using defaultAgents.json configuration
 */
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import defaultAgents from '../../buildInAgentHandlers/defaultAgents.json';
import type { AgentInstanceMessage } from '../../interface';

// Mock the dependencies BEFORE importing the plugin
vi.mock('@services/container', () => ({
  container: {
    get: vi.fn(),
  },
}));

vi.mock('@services/serviceIdentifier', () => ({
  default: {
    AgentInstance: Symbol.for('AgentInstance'),
  },
}));

// Import plugin after mocks are set up
import { createHandlerHooks } from '../index';
import { messageManagementPlugin } from '../messageManagementPlugin';
import type { ToolExecutionContext, UserMessageContext } from '../types';

// Use the real agent config from defaultAgents.json
const exampleAgent = defaultAgents[0];

describe('Message Management Plugin - Real Database Integration', () => {
  let dataSource: DataSource;
  let testAgentId: string;
  let realAgentInstanceService: {
    saveUserMessage: (message: AgentInstanceMessage) => Promise<void>;
    debounceUpdateMessage: (
      message: AgentInstanceMessage,
      agentId?: string,
    ) => void;
    updateAgent: (
      agentId: string,
      updates: Record<string, unknown>,
    ) => Promise<void>;
  };
  let hooks: ReturnType<typeof createHandlerHooks>;

  beforeEach(async () => {
    vi.clearAllMocks();
    testAgentId = `test-agent-${Date.now()}`;

    // Create in-memory SQLite database
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        AgentDefinitionEntity,
        AgentInstanceEntity,
        AgentInstanceMessageEntity,
      ],
      synchronize: true,
      logging: false,
    });

    await dataSource.initialize();

    // Create test data using defaultAgent structure
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

    // Create real service with spy for database operations
    realAgentInstanceService = {
      saveUserMessage: vi.fn(async (message: AgentInstanceMessage) => {
        const messageRepo = dataSource.getRepository(
          AgentInstanceMessageEntity,
        );
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

    // Configure mock container to return our service
    const { container } = await import('@services/container');
    vi.mocked(container.get).mockReturnValue(realAgentInstanceService);

    // Initialize plugin
    hooks = createHandlerHooks();
    messageManagementPlugin(hooks);
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

  describe('Real Wiki Search Scenario - The Missing Tool Result Bug', () => {
    it('should persist all messages in wiki search flow: user query → AI tool call → tool result → AI final response', async () => {
      const handlerContext = createHandlerContext();

      // Step 1: User asks to search wiki
      const userMessageId = `user-msg-${Date.now()}`;
      const userContext: UserMessageContext = {
        handlerContext,
        content: { text: '搜索 wiki 中的 Index 条目并解释' },
        messageId: userMessageId,
        timestamp: new Date(),
      };

      await hooks.userMessageReceived.promise(userContext);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify user message was saved
      let messageRepo = dataSource.getRepository(AgentInstanceMessageEntity);
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

      await realAgentInstanceService.saveUserMessage(aiToolCallMessage);
      handlerContext.agent.messages.push(aiToolCallMessage);

      // Step 3: Tool result message (THIS IS THE MISSING PIECE!)
      // This simulates what wikiSearchPlugin does when tool execution completes
      const toolResultMessage: AgentInstanceMessage = {
        id: `tool-result-${Date.now()}`,
        agentId: testAgentId,
        role: 'user',
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

      // Add tool result to agent messages (simulating what wikiSearchPlugin does)
      handlerContext.agent.messages.push(toolResultMessage);

      const toolContext: ToolExecutionContext = {
        handlerContext,
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
      messageRepo = dataSource.getRepository(AgentInstanceMessageEntity);
      allMessages = await messageRepo.find({
        where: { agentId: testAgentId },
        order: { modified: 'ASC' },
      });

      expect(allMessages).toHaveLength(3); // user + ai tool call + tool result

      const savedToolResult = allMessages.find((m) => m.metadata?.isToolResult);
      expect(savedToolResult).toBeTruthy();
      expect(savedToolResult?.content).toContain('<functions_result>');
      expect(savedToolResult?.content).toContain('Tool: wiki-search');
      expect(savedToolResult?.content).toContain('Index');
      expect(savedToolResult?.metadata?.toolId).toBe('wiki-search');
      expect(savedToolResult?.duration).toBe(10);

      // Verify isPersisted flag was updated
      const toolMessageInMemory = handlerContext.agent.messages.find(
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

      await realAgentInstanceService.saveUserMessage(aiFinalMessage);

      // Final verification: All 4 messages should be in database
      messageRepo = dataSource.getRepository(AgentInstanceMessageEntity);
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

      expect(allMessages[2].role).toBe('user'); // Tool result (THIS WAS MISSING!)
      expect(allMessages[2].content).toContain('<functions_result>');
      expect(allMessages[2].metadata?.isToolResult).toBe(true);

      expect(allMessages[3].role).toBe('assistant'); // AI final response
      expect(allMessages[3].content).toContain(
        '在wiki中找到了名为"Index"的条目',
      );
    });

    it('should handle multiple tool results in one execution', async () => {
      console.log('🧪 Testing multiple tool results persistence...');

      const handlerContext = createHandlerContext();

      // Add multiple tool result messages
      const toolResult1: AgentInstanceMessage = {
        id: `tool-result-1-${Date.now()}`,
        agentId: testAgentId,
        role: 'user',
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
        role: 'user',
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

      handlerContext.agent.messages.push(toolResult1, toolResult2);

      const toolContext: ToolExecutionContext = {
        handlerContext,
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
      const messageRepo = dataSource.getRepository(AgentInstanceMessageEntity);
      const allMessages = await messageRepo.find({
        where: { agentId: testAgentId },
      });

      expect(allMessages).toHaveLength(2);
      expect(allMessages.every((m) => m.metadata?.isToolResult)).toBe(true);
      expect(allMessages.every((m) => m.role === 'user')).toBe(true);

      // Verify both messages marked as persisted
      expect(toolResult1.metadata?.isPersisted).toBe(true);
      expect(toolResult2.metadata?.isPersisted).toBe(true);

      console.log('✅ Multiple tool results test passed');
    });
  });
});
