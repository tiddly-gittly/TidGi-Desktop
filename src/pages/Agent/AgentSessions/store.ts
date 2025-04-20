import { AgentTask } from '@services/agent/interface';
import * as schema from '@services/agent/server/schema';
import { omit } from 'lodash';
import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Simplified conversation structure for UI display
 * Integrates a user question and agent response into a single UI conversation unit
 * Leverages the schema.Message type from the A2A server protocol
 */
export interface Conversation {
  /** Unique conversation identifier */
  id: string;
  /** User question - extracted from schema.Message text content */
  question: string;
  /** Agent response - extracted from schema.Message text content */
  response?: string;
  /** Conversation creation timestamp */
  createdAt: Date;
  /** Conversation update timestamp */
  updatedAt?: Date;
  /** Optional original message object - for accessing additional metadata */
  message?: Pick<schema.Message, 'parts' | 'metadata'>;
}

export interface AgentStoreState {
  // Task management state
  tasks: AgentTask[];
  activeTaskId?: string;
  // Loading states for each task
  loadingStates: Record<string, boolean>;
  // Streaming states for tasks
  streamingStates: Record<string, boolean>;
  // Task creation state
  creatingTask?: boolean;
  // Available agents
  availableAgents: { id: string; name: string }[];
  selectedAgentId?: string;

  // Actions
  createNewTask: () => Promise<string>;
  deleteTask: (id: string) => void;
  selectTask: (id: string) => void;
  sendMessage: (message: string, taskId?: string) => void;
  sendMessageToAI: (message: string, taskId?: string) => Promise<void>;
  cancelAIRequest: (taskId?: string) => Promise<void>;

  // Agent management
  loadAvailableAgents: () => Promise<{ id: string; name: string }[]>;
  selectAgent: (agentId: string) => void;

  // Initialization
  initialize: () => Promise<void>;
  initTaskSyncSubscription: () => void;

  // Status checking
  isTaskLoading: (taskId: string) => boolean;
  isTaskStreaming: (taskId: string) => boolean;

  // Helpers
  getTaskConversations: (taskId: string) => Conversation[];
}

// Create store hook
export const useAgentStore = create<AgentStoreState>((set, get) => ({
  tasks: [],
  loadingStates: {},
  streamingStates: {},
  availableAgents: [],
  selectedAgentId: undefined,

  // Initialize the store
  initialize: async () => {
    try {
      // Setup subscriptions first
      get().initTaskSyncSubscription();

      // Load available agents
      const agents = await get().loadAvailableAgents();

      // Select default agent if available
      if (agents.length > 0) {
        get().selectAgent(agents[0].id);
      }
    } catch (error) {
      console.error('Failed to initialize agent store:', error);
    }
  },

  // Load all available agents
  loadAvailableAgents: async () => {
    try {
      const agents = await window.service.agent.getAgents();
      const mappedAgents = agents.map(agent => ({ id: agent.id, name: agent.name }));

      set({ availableAgents: mappedAgents });

      // Auto-select first agent if none selected
      const currentSelectedAgentId = get().selectedAgentId;
      if (!currentSelectedAgentId && mappedAgents.length > 0) {
        set({ selectedAgentId: mappedAgents[0].id });
      }

      return mappedAgents;
    } catch (error) {
      console.error('Failed to load available agents:', error);
      return [];
    }
  },

  // Select an agent and load its tasks
  selectAgent: (agentId: string) => {
    set({ selectedAgentId: agentId });

    // Load tasks for the selected agent
    window.service.agent.getAgentTasks(agentId)
      .then(tasks => {
        set({ tasks });
      })
      .catch((error: unknown) => {
        console.error(`Failed to load tasks for agent ${agentId}:`, error);
      });
  },

  // Create a new task
  createNewTask: async () => {
    const { selectedAgentId, availableAgents, creatingTask } = get();

    // Prevent duplicate creation
    if (creatingTask) {
      return '';
    }

    // Ensure we have a selected agent
    let agentId = selectedAgentId;
    if (!agentId && availableAgents.length > 0) {
      agentId = availableAgents[0].id;
      set({ selectedAgentId: agentId });
    }

    if (!agentId) {
      console.error('No agent available to create task');
      return '';
    }

    try {
      // Set creation state
      set({ creatingTask: true });

      // Create the task directly - no need for temporary objects in Electron
      const createdTask = await window.service.agent.createTask(agentId);
      // DEBUG: console createdTask
      console.log(`createdTask`, createdTask);

      set({
        activeTaskId: createdTask.id,
        creatingTask: false,
      });

      return createdTask.id;
    } catch (error) {
      console.error('Failed to create task:', error);
      set({ creatingTask: false });
      return '';
    }
  },

  // Delete a task
  deleteTask: (id: string) => {
    const { tasks, activeTaskId, loadingStates, selectedAgentId } = get();

    if (!selectedAgentId) {
      console.error('No agent selected.');
      return;
    }

    // Create new loadingStates without the deleted task
    const newLoadingStates = { ...omit(loadingStates, id) };

    // Update frontend state immediately
    set({
      tasks: tasks.filter((task) => task.id !== id),
      activeTaskId: id === activeTaskId ? undefined : activeTaskId,
      loadingStates: newLoadingStates,
    });

    // Delete on server
    window.service.agent.deleteTask(selectedAgentId, id)
      .catch((error: unknown) => {
        console.error('Failed to delete task:', error);
      });
  },

  // Select a task as active
  selectTask: (id: string) => {
    set({ activeTaskId: id });
  },

  // Check if a task is loading
  isTaskLoading: (taskId: string) => {
    return get().loadingStates[taskId] || false;
  },

  // Check if a task is streaming
  isTaskStreaming: (taskId: string) => {
    return get().streamingStates[taskId] || false;
  },

  // Send a message to the AI
  sendMessageToAI: (message: string, taskId?: string) => {
    const { activeTaskId, selectedAgentId } = get();
    const targetTaskId = taskId || activeTaskId;

    if (!targetTaskId || !selectedAgentId) {
      console.error('Missing task ID or agent ID');
      return Promise.resolve();
    }

    // Set task states
    set(state => ({
      streamingStates: { ...state.streamingStates, [targetTaskId]: true },
      loadingStates: { ...state.loadingStates, [targetTaskId]: true },
    }));

    try {
      // Call streaming API
      const stream = window.observables.agent.handleStreamingRequest(
        selectedAgentId,
        targetTaskId,
        message,
      );

      // Subscribe to stream updates
      stream.subscribe({
        next: (update) => {
          // Check if this is a status update with 'completed' state
          if (update && 'status' in update && update.status && update.status.state === 'completed') {
            // Reset loading and streaming states when the task is completed
            set(state => ({
              streamingStates: { ...state.streamingStates, [targetTaskId]: false },
              loadingStates: { ...state.loadingStates, [targetTaskId]: false },
            }));
          }
        },
        complete: () => {
          // Reset task states
          set(state => ({
            streamingStates: { ...state.streamingStates, [targetTaskId]: false },
            loadingStates: { ...state.loadingStates, [targetTaskId]: false },
          }));
        },
        error: (error) => {
          console.error('Error in streaming response:', error);
          set(state => ({
            streamingStates: { ...state.streamingStates, [targetTaskId]: false },
            loadingStates: { ...state.loadingStates, [targetTaskId]: false },
          }));
        },
      });

      return Promise.resolve();
    } catch (error) {
      console.error('Failed to send message to AI:', error);
      // Reset states
      set(state => ({
        streamingStates: { ...state.streamingStates, [targetTaskId]: false },
        loadingStates: { ...state.loadingStates, [targetTaskId]: false },
      }));
      return Promise.reject(error);
    }
  },

  // Cancel an active AI request
  cancelAIRequest: async (taskId?: string) => {
    const targetTaskId = taskId || get().activeTaskId;
    const { selectedAgentId } = get();

    if (targetTaskId && selectedAgentId) {
      try {
        await window.service.agent.deleteTask(selectedAgentId, targetTaskId);
        set(state => ({
          streamingStates: { ...state.streamingStates, [targetTaskId]: false },
          loadingStates: { ...state.loadingStates, [targetTaskId]: false },
        }));
      } catch (error) {
        console.error('Failed to cancel AI request:', error);
      }
    }
  },

  // Initialize task update subscription
  initTaskSyncSubscription: () => {
    window.observables.agent.taskUpdates$.subscribe({
      next: (taskUpdates) => {
        if (!taskUpdates || Object.keys(taskUpdates).length === 0) return;

        // Get current state
        const { tasks, activeTaskId } = get();
        const updatedTasks = [...tasks];
        let updatedActiveTaskId = activeTaskId;

        // Process each updated task
        Object.entries(taskUpdates).forEach(([taskId, taskUpdate]) => {
          const taskIndex = updatedTasks.findIndex(s => s.id === taskId);

          if (taskUpdate === null) {
            // Task was deleted
            if (taskIndex >= 0) {
              updatedTasks.splice(taskIndex, 1);

              // Clear activeTaskId if it was deleted
              if (activeTaskId === taskId) {
                updatedActiveTaskId = undefined;
              }
            }
          } else {
            // Task was updated or created
            if (taskIndex >= 0) {
              updatedTasks[taskIndex] = taskUpdate;
            } else {
              updatedTasks.push(taskUpdate);

              // Set as active if no active task
              if (!updatedActiveTaskId) {
                updatedActiveTaskId = taskId;
              }
            }
          }
        });

        // Update state
        set({
          tasks: updatedTasks,
          activeTaskId: updatedActiveTaskId,
        });
      },
      error: (error) => {
        console.error('Task updates subscription error:', error);
      },
    });
  },

  // Convert task messages to UI-friendly conversations
  getTaskConversations: (taskId: string): Conversation[] => {
    const task = get().tasks.find(s => s.id === taskId);
    if (!task) return [];

    // Simplified conversation creation from task messages
    const conversations: Conversation[] = [];
    for (let index = 0; index < task.messages.length; index++) {
      const message = task.messages[index];

      // Process user messages
      if (message.role === 'user') {
        // Find the next agent response if any
        const responseIndex = task.messages.findIndex(
          (m, index_) => index_ > index && m.role === 'agent',
        );

        const conversation: Conversation = {
          id: `${task.id}-${index}${responseIndex > -1 ? `-${responseIndex}` : ''}`,
          question: message.parts.map(part => 'text' in part ? part.text : '').join(''),
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          message: { parts: message.parts, metadata: message.metadata },
        };

        // Add response if found
        if (responseIndex > -1) {
          const responseMessage = task.messages[responseIndex];
          conversation.response = responseMessage.parts
            .map(part => 'text' in part ? part.text : '')
            .join('');

          // 保存完整的消息结构，包括任何错误部分
          conversation.message = {
            parts: responseMessage.parts,
            metadata: responseMessage.metadata,
          };
          // Skip the response message in the next iteration
          index = responseIndex;
        }


        conversations.push(conversation);
      }
    }

    return conversations;
  },

  // Send message (simple wrapper)
  sendMessage: (message: string, taskId?: string) => {
    void get().sendMessageToAI(message, taskId);
  },
}));

// React Hook to initialize store
export const useAgentStoreInitialization = () => {
  const initialize = useAgentStore(state => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);
};
