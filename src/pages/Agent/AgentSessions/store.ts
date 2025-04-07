import { Conversation, Session } from 'reachat';
import { shallow } from 'zustand/shallow';
import { createWithEqualityFn } from 'zustand/traditional';
import { createStore } from 'zustand/vanilla';

/**
 * Represents the state machine execution state of a callback, not including the result, results that is valuable to user should be stored in UIElementState.content.
 */
export interface IExecutionState {
  /** The callback method name */
  method: string;
  state: 'running' | 'success' | 'error';
  /** The execution state of this callback, may based on xstate's serialized state */
  fullState: unknown;
}

/**
 * All state from database to restore an agent's back to alive.
 */
export interface AgentState {
  /** Chat items created during a chat and persisted execution result. */
  ui?: Session;
  /** All callback's execution states, key is callback method name, value is array of state machine serialized state, because callback might execute multiple times. */
  execution?: Record<string, IExecutionState[]>;
  /** Session id */
  id?: string;
  /** Session title */
  title?: string;
  /** Created timestamp */
  createdAt?: Date;
  /** Updated timestamp */
  updatedAt?: Date;
  /** 会话内的对话列表 */
  conversations?: Conversation[];
}

export interface AgentViewModelStoreState {
  // 会话管理状态
  sessions: AgentState[];
  activeSessionId?: string;
  // 针对每个session的loading状态
  loadingStates: Record<string, boolean>;

  // 操作方法
  createNewSession: () => void;
  deleteSession: (id: string) => void;
  selectSession: (id: string) => void;
  sendMessage: (message: string, sessionId?: string) => void;

  // 获取session是否正在加载
  isSessionLoading: (sessionId: string) => boolean;
}

/**
 * Isomorphic store for UI state of a chat, runs in server side and client side. So don't use any browser/electron specific API here.
 * @param elements Existing UI state from database
 * @returns A new store for this chat
 */
export const getWorkflowViewModelStore = (initialState?: AgentState) =>
  createStore<AgentViewModelStoreState>((set, get) => ({
    ui: {},
    execution: {},
    sessions: [],
    loadingStates: {},
    ...initialState,

    createNewSession: () => {
      const { sessions } = get();
      const newId = (sessions.length + 1).toString();
      set({
        sessions: [
          ...sessions,
          {
            id: newId,
            title: `新会话 #${newId}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            conversations: [],
          },
        ],
      });
    },

    deleteSession: (id: string) => {
      const { sessions, activeSessionId, loadingStates } = get();

      // 创建一个新的loadingStates副本并删除对应session的loading状态
      const newLoadingStates = { ...loadingStates };
      delete newLoadingStates[id];

      set({
        sessions: sessions.filter((session) => session.id !== id),
        activeSessionId: id === activeSessionId ? undefined : activeSessionId,
        loadingStates: newLoadingStates,
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

      // 如果未指定sessionId且没有activeSessionId，创建新会话
      if (!targetSessionId) {
        const newId = (sessions.length + 1).toString();

        // 设置这个新会话为加载状态
        set(state => ({
          loadingStates: { ...state.loadingStates, [newId]: true },
        }));

        const newSession: AgentState = {
          id: newId,
          title: `新会话 #${newId}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          conversations: [{
            id: `${newId}-0`,
            question: message,
            response: '这是一个示例响应',
            createdAt: new Date(),
            updatedAt: new Date(),
          }],
        };

        set(state => ({
          sessions: [...state.sessions, newSession],
          activeSessionId: newId,
          loadingStates: { ...state.loadingStates, [newId]: false },
        }));

        return;
      }

      // 找到目标会话
      const current = sessions.find((s) => s.id === targetSessionId);
      if (current) {
        // 设置该会话为加载状态
        set(state => ({
          loadingStates: { ...state.loadingStates, [targetSessionId]: true },
        }));

        const conversations = current.conversations || [];
        const newMessage: Conversation = {
          id: `${targetSessionId}-${conversations.length}`,
          question: message,
          response: '这是一个示例响应',
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
  }));

// 创建一个React hooks友好的store
export const useAgentStore = createWithEqualityFn<AgentViewModelStoreState>()(
  (set, get) => getWorkflowViewModelStore().getState(),
  shallow,
);
