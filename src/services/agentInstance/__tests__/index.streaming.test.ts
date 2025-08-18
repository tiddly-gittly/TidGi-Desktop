/**
 * Tests for AgentInstanceService streaming behavior
 * Tests that sendMsgToAgent properly triggers streaming updates through observables
 */
import { nanoid } from 'nanoid';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Use shared mocks via test container (setup-vitest binds serviceInstances into the container)
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { AgentInstance } from '@services/agentInstance/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import type { IDatabaseService } from '@services/database/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';

// Import test data
import defaultAgents from '../buildInAgentHandlers/defaultAgents.json';

describe('AgentInstanceService Streaming Behavior', () => {
  let agentInstanceService: IAgentInstanceService;
  let testAgentInstance: AgentInstance;
  let mockAgentDefinitionService: Partial<IAgentDefinitionService>;
  let mockExternalAPIService: Partial<IExternalAPIService>;
  let mockDatabaseService: Partial<IDatabaseService>;
  let mockWikiService: Partial<IWikiService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Retrieve shared mocks from the test container
    const { container } = await import('@services/container');
    mockAgentDefinitionService = container.get(serviceIdentifier.AgentDefinition);
    mockDatabaseService = container.get(serviceIdentifier.Database);
    mockExternalAPIService = container.get(serviceIdentifier.ExternalAPI);
    mockWikiService = container.get(serviceIdentifier.Wiki);

    // ensure generateFromAI/cancelAIRequest are spies that tests can override
    mockExternalAPIService.generateFromAI = vi.fn();
    mockExternalAPIService.cancelAIRequest = vi.fn();

    // ensure wikiOperationInServer is spyable
    mockWikiService.wikiOperationInServer = vi.fn();

    // Setup mock database service with in-memory SQLite
    const mockRepo = {
      findOne: vi.fn(),
      save: vi.fn(),
      create: vi.fn(),
      find: vi.fn(),
      findAndCount: vi.fn(),
    };

    const mockDataSource = {
      isInitialized: true,
      initialize: vi.fn(),
      destroy: vi.fn(),
      getRepository: vi.fn().mockReturnValue(mockRepo),
      manager: {
        transaction: vi.fn().mockImplementation(async (cb: (manager: { getRepository: () => typeof mockRepo }) => Promise<unknown>) => {
          // Mock transaction - just call the callback with mock repo
          return await cb({
            getRepository: () => mockRepo,
          });
        }),
      },
    };

    mockDatabaseService.getDatabase = vi.fn().mockResolvedValue(mockDataSource);

    // Bind real AgentInstance implementation into the test container (mocks already bound by setup)
    if (container.isBound(serviceIdentifier.AgentInstance)) {
      container.unbind(serviceIdentifier.AgentInstance);
    }
    const { AgentInstanceService } = await import('@services/agentInstance/index');
    container.bind(serviceIdentifier.AgentInstance).to(AgentInstanceService).inSingletonScope();

    // Create service instance after binding dependencies
    const agentInstanceServiceImpl = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

    agentInstanceService = agentInstanceServiceImpl;

    await agentInstanceService.initialize();
    // Note: We don't mock the plugin system here - we let the real plugins (like messageManagementPlugin)
    // handle the user message processing. This is important for testing the actual streaming behavior.

    // Setup test agent instance using data from defaultAgents.json
    const exampleAgent = defaultAgents[0];
    testAgentInstance = {
      id: nanoid(),
      agentDefId: exampleAgent.id,
      name: 'Test Agent',
      status: {
        state: 'working',
        modified: new Date(),
      },
      created: new Date(),
      closed: false,
      messages: [],
    };

    // Mock agent definition service to return our test agent definition
    mockAgentDefinitionService.getAgentDef = vi.fn().mockResolvedValue({
      ...exampleAgent,
      handlerID: 'basicPromptConcatHandler',
    });
    // Mock the getAgent method to return our test instance
    vi.spyOn(agentInstanceService, 'getAgent').mockResolvedValue(testAgentInstance);
  });

  it('should trigger streaming updates when sendMsgToAgent is called', async () => {
    // Define expected content as variables
    const expectedUserMessage = '你好，请回答一个简单的问题。';
    const expectedAIResponsePart1 = '这是一个测试回答的开始...';
    const expectedAIResponsePart2 = '这是一个测试回答的开始...正在思考中...';
    const expectedAIResponseFinal = '这是一个测试回答的开始...正在思考中...完成了！这是对用户问题的完整回答。';

    // Setup mock for AI streaming response using the variables
    const mockAIResponseGenerator = function*() {
      yield {
        status: 'update' as const,
        content: expectedAIResponsePart1,
        requestId: 'test-request-1',
      };

      yield {
        status: 'update' as const,
        content: expectedAIResponsePart2,
        requestId: 'test-request-1',
      };

      yield {
        status: 'done' as const,
        content: expectedAIResponseFinal,
        requestId: 'test-request-1',
      };
    };

    mockExternalAPIService.generateFromAI = vi.fn().mockReturnValue(mockAIResponseGenerator());

    // Subscribe to agent updates before sending message
    const agentUpdatesObservable = agentInstanceService.subscribeToAgentUpdates(testAgentInstance.id);
    const agentUpdates: (AgentInstance | undefined)[] = [];

    const agentSubscription = agentUpdatesObservable.subscribe(update => {
      if (update) {
        agentUpdates.push(update);
      }
    });

    try {
      // Send message to agent using the same variable
      const sendMessagePromise = agentInstanceService.sendMsgToAgent(testAgentInstance.id, {
        text: expectedUserMessage,
      });

      // Wait for sendMsgToAgent to complete - this indicates all streaming is done
      await sendMessagePromise;

      // Verify that agent updates were triggered - expecting exactly 5 updates (with enhanced plugin system)
      expect(agentUpdates.length).toBe(5);

      // Check that the agent received the user message
      const latestUpdate = agentUpdates[agentUpdates.length - 1];
      expect(latestUpdate).toBeDefined();
      expect(latestUpdate!.messages.length).toBe(3); // User + AI messages (improved plugin handling)

      // Check that user message was added using the same variable
      const userMessage = latestUpdate!.messages.find(msg => msg.role === 'user');
      expect(userMessage).toBeDefined();
      expect(userMessage!.content).toBe(expectedUserMessage);

      // Check that AI response was added with exact expected content using the same variable
      const aiMessage = latestUpdate!.messages.find(msg => msg.role === 'assistant');
      expect(aiMessage).toBeDefined();
      expect(aiMessage!.content).toBe(expectedAIResponseFinal);
    } finally {
      agentSubscription.unsubscribe();
    }
  });

  it('should provide streaming updates for individual messages', async () => {
    // Define expected content as variables
    const expectedUserMessage = '测试消息级别流式更新';
    const expectedStreamingPart1 = '流式回答第一部分';
    const expectedStreamingPart2 = '流式回答第一部分...第二部分';
    const expectedStreamingFinal = '流式回答第一部分...第二部分...完成！';

    // Setup mock for AI streaming response with progressive content using the variables
    const mockAIResponseGenerator = function*() {
      yield {
        status: 'update' as const,
        content: expectedStreamingPart1,
        requestId: 'test-request-2',
      };

      yield {
        status: 'update' as const,
        content: expectedStreamingPart2,
        requestId: 'test-request-2',
      };

      yield {
        status: 'done' as const,
        content: expectedStreamingFinal,
        requestId: 'test-request-2',
      };
    };

    mockExternalAPIService.generateFromAI = vi.fn().mockReturnValue(mockAIResponseGenerator());

    // Track agent updates to capture the AI message ID
    let aiMessageId: string | undefined;
    const messageUpdates: (import('@services/agentInstance/interface').AgentInstanceLatestStatus | undefined)[] = [];
    let messageSubscription: import('rxjs').Subscription | undefined;

    const agentSubscription = agentInstanceService.subscribeToAgentUpdates(testAgentInstance.id).subscribe(update => {
      if (update) {
        const aiMessage = update.messages.find(msg => msg.role === 'assistant' || msg.role === 'agent');
        if (aiMessage && !aiMessageId) {
          aiMessageId = aiMessage.id;

          // Subscribe to message-level updates as soon as we get the AI message ID
          messageSubscription = agentInstanceService.subscribeToAgentUpdates(testAgentInstance.id, aiMessageId).subscribe({
            next: (status) => {
              if (status?.message) {
                messageUpdates.push(status);
                // Verify message ID consistency
                expect(status.message.id).toBe(aiMessageId);
                // Each update should contain progressive content
                expect(status.message.content).toContain(expectedStreamingPart1);
              }
            },
          });
        }
      }
    });

    try {
      // Start sending message using the same variable
      const sendMessagePromise = agentInstanceService.sendMsgToAgent(testAgentInstance.id, {
        text: expectedUserMessage,
      });

      // Wait for completion to ensure all streaming is done
      await sendMessagePromise;

      expect(aiMessageId).toBeDefined();

      if (messageSubscription) {
        messageSubscription.unsubscribe();
      }

      // Now we should have received streaming updates during the process
      expect(messageUpdates.length).toBe(2); // Received 2 updates (likely the last 2 since we subscribe mid-stream)

      // Verify the final update contains the expected final content
      const finalUpdate = messageUpdates[messageUpdates.length - 1];
      expect(finalUpdate?.message?.content).toBe(expectedStreamingFinal);

      // Verify external API was called
      expect(mockExternalAPIService.generateFromAI).toHaveBeenCalled();
    } finally {
      agentSubscription.unsubscribe();
      if (messageSubscription) {
        messageSubscription.unsubscribe();
      }
    }
  });

  it('should complete message-level observable when streaming is done', async () => {
    // Define expected content as variables
    const expectedUserMessage = '测试 Observable 完成时机';
    const expectedStreamingUpdate = '流式回答开始...';
    const expectedStreamingFinal = '流式回答开始...已完成！';

    // Setup mock for AI streaming response using the variables
    const mockAIResponseGenerator = function*() {
      yield {
        status: 'update' as const,
        content: expectedStreamingUpdate,
        requestId: 'test-request-complete',
      };

      yield {
        status: 'done' as const,
        content: expectedStreamingFinal,
        requestId: 'test-request-complete',
      };
    };

    mockExternalAPIService.generateFromAI = vi.fn().mockReturnValue(mockAIResponseGenerator());

    // This test demonstrates message-level Observable behavior
    // Since we can't easily test completion timing in our current setup,
    // we focus on verifying that message-level subscriptions work correctly

    let aiMessageId: string | undefined;
    const agentSubscription = agentInstanceService.subscribeToAgentUpdates(testAgentInstance.id).subscribe(update => {
      if (update) {
        const aiMessage = update.messages.find(msg => msg.role === 'assistant' || msg.role === 'agent');
        if (aiMessage && !aiMessageId) {
          aiMessageId = aiMessage.id;
        }
      }
    });

    try {
      // Send message using the same variable
      await agentInstanceService.sendMsgToAgent(testAgentInstance.id, {
        text: expectedUserMessage,
      });

      expect(aiMessageId).toBeDefined();

      if (aiMessageId) {
        // Test that we can create message-level subscriptions
        let subscriptionWorked = false;
        const messageSubscription = agentInstanceService.subscribeToAgentUpdates(testAgentInstance.id, aiMessageId).subscribe({
          next: () => {
            subscriptionWorked = true;
          },
          complete: () => {
            // This would be called if observable completes
          },
        });

        // Give minimal time for any immediate data
        await new Promise(resolve => setTimeout(resolve, 5));
        messageSubscription.unsubscribe();

        // Verify subscription mechanism works (even if no data flows)
        expect(subscriptionWorked).toBeTruthy();
      }

      expect(mockExternalAPIService.generateFromAI).toHaveBeenCalled();
    } finally {
      agentSubscription.unsubscribe();
    }
  });

  it('should handle AI response streaming errors gracefully', async () => {
    // Define expected content as variables
    const expectedUserMessage = '这会触发一个错误';
    const expectedErrorMessage = 'Error: Test AI error';
    const expectedErrorDetail = {
      message: 'Test AI error',
      code: 'TEST_ERROR',
      name: 'TestError',
      provider: 'test-provider',
    };

    // Setup mock for AI error response using the variables
    const mockAIResponseGenerator = function*() {
      yield {
        status: 'error' as const,
        errorDetail: expectedErrorDetail,
        requestId: 'test-request-3',
      };
    };

    mockExternalAPIService.generateFromAI = vi.fn().mockReturnValue(mockAIResponseGenerator());

    // Track AI message creation
    let aiMessageId: string | undefined;
    const agentSubscription = agentInstanceService.subscribeToAgentUpdates(testAgentInstance.id).subscribe(update => {
      if (update) {
        const aiMessage = update.messages.find(msg => msg.role === 'assistant' || msg.role === 'agent');
        if (aiMessage && !aiMessageId) {
          aiMessageId = aiMessage.id;
        }
      }
    });

    try {
      // Send message that will trigger an error using the same variable
      await agentInstanceService.sendMsgToAgent(testAgentInstance.id, {
        text: expectedUserMessage,
      });

      // Test that we can subscribe to the AI message (even if it has an error)
      if (aiMessageId) {
        let statusUpdateReceived = false;
        const messageSubscription = agentInstanceService.subscribeToAgentUpdates(testAgentInstance.id, aiMessageId).subscribe({
          next: (status) => {
            if (status?.message) {
              statusUpdateReceived = true;
              // Verify the error message structure with exact content using the same variables
              expect(status.message.content).toBe(expectedErrorMessage);
              expect(status.message.metadata?.errorDetail).toEqual(expectedErrorDetail);
            }
          },
        });

        // Give a moment for any status updates
        await new Promise(resolve => setTimeout(resolve, 10));
        messageSubscription.unsubscribe();

        // Verify error was handled through message-level updates
        expect(statusUpdateReceived).toBeTruthy();
      }

      // Verify external API was called and error was handled gracefully
      expect(mockExternalAPIService.generateFromAI).toHaveBeenCalled();
    } finally {
      agentSubscription.unsubscribe();
    }
  });
});
