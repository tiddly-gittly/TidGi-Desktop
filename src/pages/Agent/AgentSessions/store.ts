import { AgentState, AIProviderConfig, AISessionConfig, Conversation } from '@services/agent/interface';
import { omit } from 'lodash';
import { useEffect } from 'react';
import { create } from 'zustand';

export interface AgentViewModelStoreState {
  // Session management state
  sessions: AgentState[];
  activeSessionId?: string;
  // Loading states for each session
  loadingStates: Record<string, boolean>;
  // AI response streaming states
  streamingStates: Record<string, boolean>;
  // Available AI models
  availableModels: string[];
  selectedModel: string;
  // AI providers and models state
  providers: AIProviderConfig[];

  // Operations
  createNewSession: () => Promise<string>;
  deleteSession: (id: string) => void;
  selectSession: (id: string) => void;
  sendMessage: (message: string, sessionId?: string) => void;

  // AI-related methods
  sendMessageToAI: (message: string, sessionId?: string) => Promise<void>;
  cancelAIRequest: (sessionId?: string) => Promise<void>;
  loadAvailableAIModels: () => Promise<void>;
  selectAIModel: (model: string) => void;
  /**
   * Load all supported AI providers
   */
  loadAIProviders: () => Promise<void>;
  /**
   * Update session AI configuration
   */
  updateSessionAIConfig: (sessionId: string | undefined, config: AISessionConfig) => Promise<void>;
  /**
   * Get session AI configuration
   */
  getSessionAIConfig: (sessionId: string | undefined) => AISessionConfig | undefined;

  // Initialization
  initialize: () => Promise<void>;

  // Initialize AI response stream subscription
  initAIResponseStreamSubscription: () => void;

  // Initialize session sync subscription
  initSessionSyncSubscription: () => void;

  // Check if session is loading
  isSessionLoading: (sessionId: string) => boolean;
  // Check if session is streaming
  isSessionStreaming: (sessionId: string) => boolean;
}

// Use create to directly create store hook, following zustand standard pattern
export const useAgentStore = create<AgentViewModelStoreState>((set, get) => ({
  sessions: [],
  loadingStates: {},
  streamingStates: {},
  availableModels: ['gpt-4o'],
  selectedModel: 'gpt-4o',
  providers: [],

  // Initialization method, load all sessions
  initialize: async () => {
    try {
      get().initAIResponseStreamSubscription();
      get().initSessionSyncSubscription();
      get().loadAvailableAIModels();
      get().loadAIProviders();
      const sessions = await window.service.agent.getAllSessions();
      set({ sessions });
    } catch (error) {
      console.error('Failed to initialize agent store:', error);
    }
  },

  createNewSession: async () => {
    try {
      // Call server to create session and get complete session object (including generated ID)
      const createdSession = await window.service.agent.createSession();

      // Update frontend state
      set(state => ({
        sessions: [...state.sessions, createdSession],
        activeSessionId: createdSession.id,
      }));

      return createdSession.id;
    } catch (error) {
      console.error('Failed to create session:', error);
      return '';
    }
  },

  deleteSession: (id: string) => {
    const { sessions, activeSessionId, loadingStates } = get();

    // Create a new copy of loadingStates and delete the loading state of the corresponding session
    const newLoadingStates = { ...omit(loadingStates, id) };

    // First update the frontend state for immediate feedback
    set({
      sessions: sessions.filter((session) => session.id !== id),
      activeSessionId: id === activeSessionId ? undefined : activeSessionId,
      loadingStates: newLoadingStates,
    });

    // Simultaneously delete the session on the server
    window.service.agent.deleteSession(id)
      .catch(error => {
        console.error('Failed to delete session in service:', error);
      });
  },

  selectSession: (id: string) => {
    set({ activeSessionId: id });
  },

  isSessionLoading: (sessionId: string) => {
    return get().loadingStates[sessionId] || false;
  },

  sendMessage: (message: string, sessionId?: string) => {
    const { sessions, activeSessionId } = get();
    const targetSessionId = sessionId || activeSessionId;

    // Find the target session
    const current = sessions.find((s) => s.id === targetSessionId);
    if (targetSessionId && current) {
      // Set the session to loading state
      set(state => ({
        loadingStates: { ...state.loadingStates, [targetSessionId]: true },
      }));

      const conversations = current.conversations || [];
      const newMessage: Conversation = {
        id: `${targetSessionId}-${conversations.length}`,
        question: message,
        response: 'This is a sample response',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updated = {
        ...current,
        conversations: [...conversations, newMessage],
        updatedAt: new Date(),
      };

      set(state => ({
        sessions: [...state.sessions.filter((s) => s.id !== targetSessionId), updated],
        loadingStates: { ...state.loadingStates, [targetSessionId]: false },
      }));
    }
  },

  isSessionStreaming: (sessionId: string) => {
    return get().streamingStates[sessionId] || false;
  },

  sendMessageToAI: async (message: string, sessionId?: string) => {
    const { activeSessionId } = get();
    const targetSessionId = sessionId || activeSessionId;
    if (!targetSessionId) {
      console.error('No active session ID provided');
      return;
    }

    // Set session to streaming state
    set(state => ({
      streamingStates: { ...state.streamingStates, [targetSessionId]: true },
    }));

    try {
      // Call server-side method to handle the entire process
      await window.service.agent.sendMessageToAI(targetSessionId, message);
    } catch (error) {
      console.error('Failed to send message to AI:', error);
      // Reset streaming state on error
      set(state => ({
        streamingStates: { ...state.streamingStates, [targetSessionId]: false },
      }));
    }
  },

  cancelAIRequest: async (sessionId?: string) => {
    const targetSessionId = sessionId || get().activeSessionId;
    if (targetSessionId) {
      try {
        await window.service.agent.cancelAIRequest(targetSessionId);
        // Reset streaming state
        set(state => ({
          streamingStates: { ...state.streamingStates, [targetSessionId]: false },
        }));
      } catch (error) {
        console.error('Failed to cancel AI request:', error);
      }
    }
  },

  loadAIProviders: async () => {
    const providers = await window.service.agent.getAIProviders();
    set({ providers });
  },

  updateSessionAIConfig: async (sessionId, config) => {
    if (!sessionId) {
      return;
    }

    try {
      // First update frontend state
      const { sessions } = get();
      const session = sessions.find(s => s.id === sessionId);

      if (session) {
        // 确保有 modelParameters 结构
        if (!config.modelParameters && session.aiConfig?.modelParameters) {
          config.modelParameters = { ...session.aiConfig.modelParameters };
        }

        const updatedSession = {
          ...session,
          aiConfig: { ...config },
          updatedAt: new Date(),
        };

        set({
          sessions: [
            ...sessions.filter(s => s.id !== sessionId),
            updatedSession,
          ],
        });

        // Then update server state
        await window.service.agent.updateSessionAIConfig(sessionId, config);
      }
    } catch (error) {
      console.error('Failed to update session AI config:', error);
    }
  },

  getSessionAIConfig: (sessionId) => {
    if (!sessionId) {
      return undefined;
    }

    const { sessions } = get();
    const session = sessions.find(s => s.id === sessionId);

    return session?.aiConfig;
  },

  loadAvailableAIModels: async () => {
    const models = await window.service.agent.getAvailableAIModels();
    set({ availableModels: models });
  },

  selectAIModel: (model: string) => {
    set({ selectedModel: model });
  },

  // Initialize AI response stream subscription
  initAIResponseStreamSubscription: () => {
    // Subscribe to AI streaming response
    window.observables.agent.aiResponseStream$.subscribe({
      next: (response) => {
        if (!response) return;

        const { sessionId, content, status } = response;
        const { sessions, streamingStates } = get();
        const current = sessions.find(s => s.id === sessionId);

        if (current && current.conversations?.length) {
          const conversations = current.conversations;
          const lastConversation = conversations[conversations.length - 1];

          // Update session based on status
          if (status === 'start') {
            // Mark session as streaming state
            set({
              streamingStates: { ...streamingStates, [sessionId]: true },
            });
          }

          const updatedSession = {
            ...current,
            conversations: [
              ...conversations.slice(0, -1),
              { ...lastConversation, response: content },
            ],
          };

          set({
            sessions: [...sessions.filter(s => s.id !== sessionId), updatedSession],
          });

          // On completion/error/cancellation, close streaming state
          if (status === 'done' || status === 'error' || status === 'cancel') {
            set({
              streamingStates: { ...get().streamingStates, [sessionId]: false },
            });
          }
        } else {
          console.warn('No matching session or conversation found:', sessionId);
        }
      },
      error: (error) => {
        console.error('AI response stream error:', error);
      },
    });
  },

  // Initialize session sync subscription
  initSessionSyncSubscription: () => {
    // Subscribe to session sync, note to use window.observables instead of window.service
    window.observables.agent.sessionSync$.subscribe({
      next: (syncData) => {
        if (!syncData) return;

        const { session, action } = syncData;
        const { sessions, activeSessionId } = get();

        // Handle sync based on action type
        if (action === 'create' || action === 'update') {
          // Update or add session
          set({
            sessions: [
              ...sessions.filter(s => s.id !== session.id),
              session,
            ],
          });
        } else if (action === 'delete') {
          // Delete session
          set({
            sessions: sessions.filter(s => s.id !== session.id),
            // If the deleted session is the current active session, clear activeSessionId
            activeSessionId: session.id === activeSessionId ? undefined : activeSessionId,
          });
        }
      },
    });
  },
}));

// Use React Hook to initialize store
export const useAgentStoreInitialization = () => {
  const initialize = useAgentStore(state => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);
};

// Remove old event listener code, use React Hook to perform initialization
export const useAIResponseStreamSubscription = () => {
  useEffect(() => {
    useAgentStore.getState().initAIResponseStreamSubscription();
  }, []);
};
