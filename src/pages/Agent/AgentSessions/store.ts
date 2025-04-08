import { Conversation, Session } from '@services/agent/interface';
import { omit } from 'lodash';
import { create } from 'zustand';

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
  createNewSession: () => string;
  deleteSession: (id: string) => void;
  selectSession: (id: string) => void;
  sendMessage: (message: string, sessionId?: string) => void;

  // 获取session是否正在加载
  isSessionLoading: (sessionId: string) => boolean;
}

// 使用 create 直接创建 store hook，符合 zustand 标准模式
export const useAgentStore = create<AgentViewModelStoreState>((set, get) => ({
  sessions: [],
  loadingStates: {},

  createNewSession: () => {
    const { sessions } = get();
    const newId = (sessions.length + 1).toString();

    // 先确保会话有一个唯一ID
    let uniqueId = newId;
    while (sessions.some(s => s.id === uniqueId)) {
      // 如果ID已存在，生成一个新的ID
      uniqueId = `${parseInt(uniqueId) + 1}`;
    }

    const newSession: AgentState = {
      id: uniqueId,
      title: `新会话 #${uniqueId}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      conversations: [],
    };

    set(state => ({
      sessions: [...state.sessions, newSession],
      activeSessionId: uniqueId,
    }));

    return uniqueId;
  },

  deleteSession: (id: string) => {
    const { sessions, activeSessionId, loadingStates } = get();

    // 创建一个新的loadingStates副本并删除对应session的loading状态
    const newLoadingStates = { ...omit(loadingStates, id) };

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
