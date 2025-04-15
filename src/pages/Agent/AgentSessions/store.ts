import { AgentSession } from '@services/agent/interface';
import * as schema from '@services/agent/server/schema';
import { omit } from 'lodash';
import { useEffect } from 'react';
import { create } from 'zustand';

// 为了保持与旧UI兼容，创建会话映射函数
export interface Conversation {
  id: string;
  question: string;
  response?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// 添加creatingSession标志到store状态中
export interface AgentViewModelStoreState {
  // 会话管理状态
  sessions: AgentSession[];
  activeSessionId?: string;
  // 每个会话的加载状态
  loadingStates: Record<string, boolean>;
  // AI响应流式状态
  streamingStates: Record<string, boolean>;
  // 创建会话状态
  creatingSession?: boolean;
  // 可用智能体
  availableAgents: { id: string; name: string }[];
  selectedAgentId?: string;

  // 操作方法
  createNewSession: () => Promise<string>;
  deleteSession: (id: string) => void;
  selectSession: (id: string) => void;
  sendMessage: (message: string, sessionId?: string) => void;
  sendMessageToAI: (message: string, sessionId?: string) => Promise<void>;
  cancelAIRequest: (sessionId?: string) => Promise<void>;

  // 加载可用智能体
  loadAvailableAgents: () => Promise<void>;
  selectAgent: (agentId: string) => void;

  // 初始化
  initialize: () => Promise<void>;
  initSessionSyncSubscription: () => void;

  // 检查会话状态
  isSessionLoading: (sessionId: string) => boolean;
  isSessionStreaming: (sessionId: string) => boolean;

  // 辅助方法
  getSessionConversations: (sessionId: string) => Conversation[];
}

// 创建store hook
export const useAgentStore = create<AgentViewModelStoreState>((set, get) => ({
  sessions: [],
  loadingStates: {},
  streamingStates: {},
  availableAgents: [],
  selectedAgentId: undefined,

  // 初始化方法
  initialize: async () => {
    try {
      // 初始化订阅
      get().initSessionSyncSubscription();

      // 首先加载可用智能体
      await get().loadAvailableAgents();

      // 确保有可用智能体后再继续
      const { availableAgents } = get();
      console.log('Available agents:', availableAgents);

      // 如果有可用智能体，选择第一个作为默认
      if (availableAgents.length > 0) {
        console.log('Selecting default agent:', availableAgents[0].id);
        get().selectAgent(availableAgents[0].id);
      } else {
        console.warn('No available agents found during initialization');
      }
    } catch (error) {
      console.error('Failed to initialize agent store:', error);
    }
  },

  // 加载可用智能体
  loadAvailableAgents: async () => {
    try {
      // DEBUG: console
      console.log(`getAgents`);
      const agents = await window.service.agent.getAgents();
      console.log('Loaded agents:', agents);

      const mappedAgents = agents.map(agent => ({ id: agent.id, name: agent.name }));
      set({ availableAgents: mappedAgents });

      // 如果没有选择的智能体但有可用智能体，自动选择第一个
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

  // 选择智能体
  selectAgent: (agentId: string) => {
    set({ selectedAgentId: agentId });
    
    // 从服务器加载该智能体的所有会话
    window.service.agent.getAgentSessions(agentId)
      .then(sessions => {
        // 完全替换当前会话列表，而不是将其持久化
        set({ sessions });
      })
      .catch(error => {
        console.error(`Failed to load sessions for agent ${agentId}:`, error);
      });
  },

  // 创建新会话 - 使用乐观更新模式并确保后端同步
  createNewSession: async () => {
    let { selectedAgentId, availableAgents, creatingSession } = get();
    
    // 防止重复点击创建
    if (creatingSession) {
      console.log('Already creating a session, please wait...');
      return '';
    }
    
    // 如果没有选择的智能体，尝试加载可用智能体
    if (!selectedAgentId || availableAgents.length === 0) {
      availableAgents = await get().loadAvailableAgents();
    }

    // 如果还是没有选择的智能体但有可用智能体，使用第一个
    if (!selectedAgentId && availableAgents.length > 0) {
      selectedAgentId = availableAgents[0].id;
      set({ selectedAgentId });
    }

    if (!selectedAgentId) {
      console.error('No agent available to create session');
      return '';
    }

    try {
      console.log(`Creating new session with agent: ${selectedAgentId}`);

      // 设置创建中的加载状态
      set({ creatingSession: true });

      // 创建临时ID - 后端会返回实际ID，但我们先在UI上显示
      const tempId = `temp-${Date.now()}`;
      
      // 创建临时会话对象用于UI立即显示（乐观更新）
      const now = new Date();
      const tempSession: AgentSession = {
        id: tempId,
        agentId: selectedAgentId,
        messages: [],
        currentSessionId: tempId,
        createdAt: now,
        updatedAt: now,
      };

      // 立即更新UI，显示临时会话
      set(state => ({
        activeSessionId: tempId,
        sessions: [...state.sessions, tempSession],
      }));

      // 向后端发送创建会话的请求
      const createdSession = await window.service.agent.createSession(selectedAgentId);
      console.log('Received backend session creation response:', createdSession);

      // 当后端返回创建的会话时，替换临时会话
      set(state => {
        // 先删除临时会话
        const filteredSessions = state.sessions.filter(s => s.id !== tempId);
        
        // 检查是否已经通过sessionUpdates$添加了实际会话
        const alreadyAdded = state.sessions.some(s => s.id === createdSession.id);
        
        return {
          // 只在未被添加的情况下添加新会话
          sessions: alreadyAdded ? filteredSessions : [...filteredSessions, createdSession],
          activeSessionId: createdSession.id,
          creatingSession: false
        };
      });

      return createdSession.id;
    } catch (error) {
      console.error('Failed to create session:', error);
      
      // 出错时，移除临时会话
      set(state => ({
        sessions: state.sessions.filter(s => !s.id.startsWith('temp-')),
        creatingSession: false
      }));
      
      return '';
    }
  },

  // 删除会话
  deleteSession: (id: string) => {
    const { sessions, activeSessionId, loadingStates, selectedAgentId } = get();

    if (!selectedAgentId) {
      console.error('No agent selected.');
      return;
    }

    // 创建新的loadingStates并删除对应会话的加载状态
    const newLoadingStates = { ...omit(loadingStates, id) };

    // 首先更新前端状态以提供即时反馈
    set({
      sessions: sessions.filter((session) => session.id !== id),
      activeSessionId: id === activeSessionId ? undefined : activeSessionId,
      loadingStates: newLoadingStates,
    });

    // 同时在服务器上删除会话
    window.service.agent.deleteSession(selectedAgentId, id)
      .catch(error => {
        console.error('Failed to delete session in service:', error);
      });
  },

  // 选择会话
  selectSession: (id: string) => {
    set({ activeSessionId: id });
  },

  // 检查会话是否正在加载
  isSessionLoading: (sessionId: string) => {
    return get().loadingStates[sessionId] || false;
  },

  // 检查会话是否正在流式传输
  isSessionStreaming: (sessionId: string) => {
    return get().streamingStates[sessionId] || false;
  },

  // 向AI发送消息
  sendMessageToAI: async (message: string, sessionId?: string) => {
    const { activeSessionId, selectedAgentId } = get();
    const targetSessionId = sessionId || activeSessionId;
    
    if (!targetSessionId) {
      console.error('No active session ID provided');
      return;
    }

    if (!selectedAgentId) {
      console.error('No agent selected');
      return;
    }

    // 设置会话为流式状态
    set(state => ({
      streamingStates: { ...state.streamingStates, [targetSessionId]: true },
      loadingStates: { ...state.loadingStates, [targetSessionId]: true },
    }));

    try {
      // 先临时更新UI状态，显示用户消息
      // 注意：这不会持久化到服务器，只是为了UI响应性
      const session = get().sessions.find(s => s.id === targetSessionId);
      if (session) {
        // 创建新的用户消息
        const userMessage: schema.Message = {
          role: 'user',
          parts: [{ text: message }],
        };
        
        // 临时更新会话消息列表，实际会话状态将通过sessionUpdates$同步
        const updatedSession = {
          ...session,
          messages: [...session.messages, userMessage],
          updatedAt: new Date(),
        };
        
        // 更新会话列表
        set(state => ({
          sessions: [
            ...state.sessions.filter(s => s.id !== targetSessionId),
            updatedSession,
          ],
        }));
      }

      console.log(`Sending message to agent ${selectedAgentId}, session ${targetSessionId}: ${message}`);

      // 调用流式请求API，会触发服务器端处理
      const stream = window.observables.agent.handleStreamingRequest(
        selectedAgentId,
        targetSessionId,
        message,
      );

      // 订阅流式更新
      stream.subscribe({
        next: (event) => {
          // 服务器已经在处理会话更新，这里不需要手动更新会话
          console.log(`Received stream event:`, event);
        },
        complete: () => {
          // 重置会话状态
          set(state => ({
            streamingStates: { ...state.streamingStates, [targetSessionId]: false },
            loadingStates: { ...state.loadingStates, [targetSessionId]: false },
          }));
          
          // 流完成后刷新获取一次最新会话
          if (selectedAgentId) {
            window.service.agent.getSession(targetSessionId)
              .then(latestSession => {
                if (latestSession) {
                  // 更新当前会话
                  set(state => {
                    const updatedSessions = [...state.sessions];
                    const sessionIndex = updatedSessions.findIndex(s => s.id === latestSession.id);
                    
                    if (sessionIndex >= 0) {
                      updatedSessions[sessionIndex] = latestSession;
                    } else {
                      updatedSessions.push(latestSession);
                    }
                    
                    return { sessions: updatedSessions };
                  });
                }
              })
              .catch(error => {
                console.error('Failed to refresh session after completion:', error);
              });
          }
        },
        error: (error) => {
          console.error('Error in streaming response:', error);
          set(state => ({
            streamingStates: { ...state.streamingStates, [targetSessionId]: false },
            loadingStates: { ...state.loadingStates, [targetSessionId]: false },
          }));
        },
      });
    } catch (error) {
      console.error('Failed to send message to AI:', error);
      // 重置状态
      set(state => ({
        streamingStates: { ...state.streamingStates, [targetSessionId]: false },
        loadingStates: { ...state.loadingStates, [targetSessionId]: false },
      }));
    }
  },

  // 取消AI请求
  cancelAIRequest: async (sessionId?: string) => {
    const targetSessionId = sessionId || get().activeSessionId;
    const { selectedAgentId } = get();

    if (targetSessionId && selectedAgentId) {
      try {
        // 发送取消请求
        await window.service.agent.deleteSession(selectedAgentId, targetSessionId);
        // 重置状态
        set(state => ({
          streamingStates: { ...state.streamingStates, [targetSessionId]: false },
          loadingStates: { ...state.loadingStates, [targetSessionId]: false },
        }));
      } catch (error) {
        console.error('Failed to cancel AI request:', error);
      }
    }
  },

  // 初始化会话同步订阅 - 确保正确处理后端更新
  initSessionSyncSubscription: () => {
    // 订阅会话更新
    window.observables.agent.sessionUpdates$.subscribe({
      next: (sessionUpdates) => {
        if (!sessionUpdates || Object.keys(sessionUpdates).length === 0) return;
        console.log('[Store] Received session updates:', sessionUpdates);

        // 获取当前状态
        const { sessions, activeSessionId } = get();
        const updatedSessions = [...sessions];
        let updatedActiveSessionId = activeSessionId;

        // 处理每个更新的会话
        Object.entries(sessionUpdates).forEach(([sessionId, sessionUpdate]) => {
          const sessionIndex = updatedSessions.findIndex(s => s.id === sessionId);
          
          if (sessionUpdate === null) {
            // 会话被删除
            if (sessionIndex >= 0) {
              console.log(`[Store] Removing session ${sessionId} from frontend state`);
              updatedSessions.splice(sessionIndex, 1);
              
              // 如果删除的是当前活动会话，清除activeSessionId
              if (activeSessionId === sessionId) {
                updatedActiveSessionId = undefined;
              }
            }
          } else {
            // 会话被更新或创建
            if (sessionIndex >= 0) {
              console.log(`[Store] Updating existing session ${sessionId} with new messages:`, 
                sessionUpdate.messages.length, 'messages');
              updatedSessions[sessionIndex] = sessionUpdate;
            } else {
              console.log(`[Store] Adding new session ${sessionId} from backend`);
              updatedSessions.push(sessionUpdate);
              
              // 如果当前没有活动的会话，将这个新会话设为活动
              if (!updatedActiveSessionId || updatedActiveSessionId.startsWith('temp-')) {
                updatedActiveSessionId = sessionId;
              }
            }
          }
        });

        // 移除所有临时会话（它们已被后端的实际会话所取代）
        const finalSessions = updatedSessions.filter(s => !s.id.startsWith('temp-'));
        
        // 更新状态
        set({ 
          sessions: finalSessions,
          activeSessionId: updatedActiveSessionId
        });
        
        // 为了调试，打印最新的会话状态
        console.log(`[Store] Updated sessions (${finalSessions.length})`, 
          finalSessions.map(s => ({ id: s.id, messages: s.messages.length })));
        if (updatedActiveSessionId) {
          const conversations = get().getSessionConversations(updatedActiveSessionId);
          console.log(`[Store] Current conversations for active session:`, conversations);
        }
      },
      error: (error) => {
        console.error('Session updates subscription error:', error);
      },
    });
  },

  // 获取会话的对话列表（兼容旧的UI格式）
  getSessionConversations: (sessionId: string): Conversation[] => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) return [];
    
    console.log(`[Store] Converting session ${sessionId} with ${session.messages.length} messages`); // 添加日志
    
    // 将AgentSession的消息格式转换为Conversation格式
    const conversations: Conversation[] = [];
    let userMessage: schema.Message | null = null;
    let lastProcessedIndex = -1;

    for (let index = 0; index < session.messages.length; index++) {
      const message = session.messages[index];
      console.log(`[Store] Processing message ${index}:`, message.role, message.parts.map(p => 'text' in p ? p.text : '').join('')); 

      if (message.role === 'user') {
        // 如果有上一个未处理的用户消息，先创建一个没有回复的对话
        if (userMessage && lastProcessedIndex < index - 1) {
          conversations.push({
            id: `${session.id}-${index-1}`,
            question: userMessage.parts.map(part => 'text' in part ? part.text : '').join(''),
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          });
        }
        
        // 保存新的用户消息
        userMessage = message;
        lastProcessedIndex = index;
      } else if (message.role === 'agent') {
        // 如果这是最后一条消息，或者下一条也是智能体消息
        const isLastMessage = index === session.messages.length - 1;
        const nextIsAgentToo = !isLastMessage && session.messages[index + 1].role === 'agent';
        
        // 如果不是最后一条消息，且下一条也是智能体消息，则跳过当前消息（除非是最终回复）
        if (!isLastMessage && nextIsAgentToo && !message.parts[0].text.includes('You said:')) {
          console.log(`[Store] Skipping intermediate agent message: ${message.parts[0].text}`);
          continue;
        }
        
        // 有用户消息和智能体回复时，创建一个完整对话
        if (userMessage) {
          const response = message.parts.map(part => 'text' in part ? part.text : '').join('');
          console.log(`[Store] Created conversation with response: ${response}`);
          
          conversations.push({
            id: `${session.id}-${lastProcessedIndex}-${index}`,
            question: userMessage.parts.map(part => 'text' in part ? part.text : '').join(''),
            response: response,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          });
          
          userMessage = null;
          lastProcessedIndex = index;
        }
      }
    }
    
    // 处理最后一个没有回复的用户消息
    if (userMessage) {
      conversations.push({
        id: `${session.id}-${session.messages.length-1}`,
        question: userMessage.parts.map(part => 'text' in part ? part.text : '').join(''),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      });
    }
    
    console.log(`[Store] Produced ${conversations.length} conversations`);
    return conversations;
  },

  // 发送消息（兼容旧接口）
  sendMessage: (message: string, sessionId?: string) => {
    get().sendMessageToAI(message, sessionId);
  },
}));

// 使用React Hook初始化store
export const useAgentStoreInitialization = () => {
  const initialize = useAgentStore(state => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);
};
