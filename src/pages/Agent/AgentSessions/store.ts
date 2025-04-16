import { AgentTask } from '@services/agent/interface';
import * as schema from '@services/agent/server/schema';
import { omit } from 'lodash';
import { useEffect } from 'react';
import { create } from 'zustand';

// 对话界面使用的简化数据结构
export interface Conversation {
  id: string;
  question: string;
  response?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface AgentStoreState {
  // 任务管理状态
  tasks: AgentTask[];
  activeTaskId?: string;
  // 每个任务的加载状态
  loadingStates: Record<string, boolean>;
  // AI响应流式状态
  streamingStates: Record<string, boolean>;
  // 创建任务状态
  creatingTask?: boolean;
  // 可用智能体
  availableAgents: { id: string; name: string }[];
  selectedAgentId?: string;

  // 操作方法
  createNewTask: () => Promise<string>;
  deleteTask: (id: string) => void;
  selectTask: (id: string) => void;
  sendMessage: (message: string, taskId?: string) => void;
  sendMessageToAI: (message: string, taskId?: string) => Promise<void>;
  cancelAIRequest: (taskId?: string) => Promise<void>;

  // 加载可用智能体
  loadAvailableAgents: () => Promise<{ id: string; name: string }[]>;
  selectAgent: (agentId: string) => void;

  // 初始化
  initialize: () => Promise<void>;
  initTaskSyncSubscription: () => void;

  // 检查任务状态
  isTaskLoading: (taskId: string) => boolean;
  isTaskStreaming: (taskId: string) => boolean;

  // 辅助方法
  getTaskConversations: (taskId: string) => Conversation[];
}

// 创建store hook
export const useAgentStore = create<AgentStoreState>((set, get) => ({
  tasks: [],
  loadingStates: {},
  streamingStates: {},
  availableAgents: [],
  selectedAgentId: undefined,

  // 初始化方法
  initialize: async () => {
    try {
      // 初始化订阅
      get().initTaskSyncSubscription();

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

    // 从服务器加载该智能体的所有任务
    window.service.agent.getAgentTasks(agentId)
      .then(tasks => {
        // 完全替换当前任务列表
        set({ tasks });
      })
      .catch(error => {
        console.error(`Failed to load tasks for agent ${agentId}:`, error);
      });
  },

  // 创建新任务
  createNewTask: async () => {
    let { selectedAgentId, availableAgents, creatingTask } = get();

    // 防止重复点击创建
    if (creatingTask) {
      console.log('Already creating a task, please wait...');
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
      console.error('No agent available to create task');
      return '';
    }

    try {
      console.log(`Creating new task with agent: ${selectedAgentId}`);

      // 设置创建中的加载状态
      set({ creatingTask: true });

      // 创建临时ID - 后端会返回实际ID，但我们先在UI上显示
      const temporaryId = `temp-${Date.now()}`;

      // 创建临时任务对象用于UI立即显示（乐观更新）
      const now = new Date();
      const temporaryTask: AgentTask = {
        id: temporaryId,
        agentId: selectedAgentId,
        messages: [],
        status: {
          state: 'submitted',
          timestamp: now.toISOString(),
        },
        createdAt: now,
        updatedAt: now,
      };

      // 立即更新UI，显示临时任务
      set(state => ({
        activeTaskId: temporaryId,
        tasks: [...state.tasks, temporaryTask],
      }));

      // 向后端发送创建任务的请求
      const createdTask = await window.service.agent.createTask(selectedAgentId);
      console.log('Received backend task creation response:', createdTask);

      // 当后端返回创建的任务时，替换临时任务
      set(state => {
        // 先删除临时任务
        const filteredTasks = state.tasks.filter(s => s.id !== temporaryId);

        // 检查是否已经通过sessionUpdates$添加了实际任务
        const alreadyAdded = state.tasks.some(s => s.id === createdTask.id);

        return {
          // 只在未被添加的情况下添加新任务
          tasks: alreadyAdded ? filteredTasks : [...filteredTasks, createdTask],
          activeTaskId: createdTask.id,
          creatingTask: false,
        };
      });

      return createdTask.id;
    } catch (error) {
      console.error('Failed to create task:', error);

      // 出错时，移除临时任务
      set(state => ({
        tasks: state.tasks.filter(s => !s.id.startsWith('temp-')),
        creatingTask: false,
      }));

      return '';
    }
  },

  // 删除任务
  deleteTask: (id: string) => {
    const { tasks, activeTaskId, loadingStates, selectedAgentId } = get();

    if (!selectedAgentId) {
      console.error('No agent selected.');
      return;
    }

    // 创建新的loadingStates并删除对应任务的加载状态
    const newLoadingStates = { ...omit(loadingStates, id) };

    // 首先更新前端状态以提供即时反馈
    set({
      tasks: tasks.filter((task) => task.id !== id),
      activeTaskId: id === activeTaskId ? undefined : activeTaskId,
      loadingStates: newLoadingStates,
    });

    // 同时在服务器上删除任务
    window.service.agent.deleteTask(selectedAgentId, id)
      .catch(error => {
        console.error('Failed to delete task in service:', error);
      });
  },

  // 选择任务
  selectTask: (id: string) => {
    set({ activeTaskId: id });
  },

  // 检查任务是否正在加载
  isTaskLoading: (taskId: string) => {
    return get().loadingStates[taskId] || false;
  },

  // 检查任务是否正在流式传输
  isTaskStreaming: (taskId: string) => {
    return get().streamingStates[taskId] || false;
  },

  // 向AI发送消息
  sendMessageToAI: async (message: string, taskId?: string) => {
    const { activeTaskId, selectedAgentId } = get();
    const targetTaskId = taskId || activeTaskId;

    if (!targetTaskId) {
      console.error('No active task ID provided');
      return;
    }

    if (!selectedAgentId) {
      console.error('No agent selected');
      return;
    }

    // 设置任务为流式状态
    set(state => ({
      streamingStates: { ...state.streamingStates, [targetTaskId]: true },
      loadingStates: { ...state.loadingStates, [targetTaskId]: true },
    }));

    try {
      // 先临时更新UI状态，显示用户消息
      const task = get().tasks.find(s => s.id === targetTaskId);
      if (task) {
        // 创建新的用户消息
        const userMessage: schema.Message = {
          role: 'user',
          parts: [{ text: message }],
        };

        // 临时更新任务消息列表，实际任务状态将通过sessionUpdates$同步
        const updatedTask = {
          ...task,
          messages: [...task.messages, userMessage],
          updatedAt: new Date(),
        };

        // 更新任务列表
        set(state => ({
          tasks: [
            ...state.tasks.filter(s => s.id !== targetTaskId),
            updatedTask,
          ],
        }));
      }

      console.log(`Sending message to agent ${selectedAgentId}, task ${targetTaskId}: ${message}`);

      // 调用流式请求API，会触发服务器端处理
      const stream = window.observables.agent.handleStreamingRequest(
        selectedAgentId,
        targetTaskId,
        message,
      );

      // 订阅流式更新
      stream.subscribe({
        next: (event) => {
          console.log(`Received stream event:`, event);
        },
        complete: () => {
          // 重置任务状态
          set(state => ({
            streamingStates: { ...state.streamingStates, [targetTaskId]: false },
            loadingStates: { ...state.loadingStates, [targetTaskId]: false },
          }));

          // 流完成后刷新获取一次最新任务
          if (selectedAgentId) {
            window.service.agent.getTask(targetTaskId)
              .then(latestTask => {
                if (latestTask) {
                  // 更新当前任务
                  set(state => {
                    const updatedTasks = [...state.tasks];
                    const taskIndex = updatedTasks.findIndex(s => s.id === latestTask.id);

                    if (taskIndex >= 0) {
                      updatedTasks[taskIndex] = latestTask;
                    } else {
                      updatedTasks.push(latestTask);
                    }

                    return { tasks: updatedTasks };
                  });
                }
              })
              .catch(error => {
                console.error('Failed to refresh task after completion:', error);
              });
          }
        },
        error: (error) => {
          console.error('Error in streaming response:', error);
          set(state => ({
            streamingStates: { ...state.streamingStates, [targetTaskId]: false },
            loadingStates: { ...state.loadingStates, [targetTaskId]: false },
          }));
        },
      });
    } catch (error) {
      console.error('Failed to send message to AI:', error);
      // 重置状态
      set(state => ({
        streamingStates: { ...state.streamingStates, [targetTaskId]: false },
        loadingStates: { ...state.loadingStates, [targetTaskId]: false },
      }));
    }
  },

  // 取消AI请求
  cancelAIRequest: async (taskId?: string) => {
    const targetTaskId = taskId || get().activeTaskId;
    const { selectedAgentId } = get();

    if (targetTaskId && selectedAgentId) {
      try {
        // 发送取消请求
        await window.service.agent.deleteTask(selectedAgentId, targetTaskId);
        // 重置状态
        set(state => ({
          streamingStates: { ...state.streamingStates, [targetTaskId]: false },
          loadingStates: { ...state.loadingStates, [targetTaskId]: false },
        }));
      } catch (error) {
        console.error('Failed to cancel AI request:', error);
      }
    }
  },

  // 初始化任务同步订阅
  initTaskSyncSubscription: () => {
    // 订阅任务更新
    window.observables.agent.taskUpdates$.subscribe({
      next: (taskUpdates) => {
        if (!taskUpdates || Object.keys(taskUpdates).length === 0) return;
        console.log('[Store] Received task updates:', taskUpdates);

        // 获取当前状态
        const { tasks, activeTaskId } = get();
        const updatedTasks = [...tasks];
        let updatedActiveTaskId = activeTaskId;

        // 处理每个更新的任务
        Object.entries(taskUpdates).forEach(([taskId, taskUpdate]) => {
          const taskIndex = updatedTasks.findIndex(s => s.id === taskId);

          if (taskUpdate === null) {
            // 任务被删除
            if (taskIndex >= 0) {
              console.log(`[Store] Removing task ${taskId} from frontend state`);
              updatedTasks.splice(taskIndex, 1);

              // 如果删除的是当前活动任务，清除activeTaskId
              if (activeTaskId === taskId) {
                updatedActiveTaskId = undefined;
              }
            }
          } else {
            // 任务被更新或创建
            if (taskIndex >= 0) {
              console.log(`[Store] Updating existing task ${taskId} with new messages:`, taskUpdate.messages.length, 'messages');
              updatedTasks[taskIndex] = taskUpdate;
            } else {
              console.log(`[Store] Adding new task ${taskId} from backend`);
              updatedTasks.push(taskUpdate);

              // 如果当前没有活动的任务，将这个新任务设为活动
              if (!updatedActiveTaskId || updatedActiveTaskId.startsWith('temp-')) {
                updatedActiveTaskId = taskId;
              }
            }
          }
        });

        // 移除所有临时任务（它们已被后端的实际任务所取代）
        const finalTasks = updatedTasks.filter(s => !s.id.startsWith('temp-'));

        // 更新状态
        set({
          tasks: finalTasks,
          activeTaskId: updatedActiveTaskId,
        });

        // 为了调试，打印最新的任务状态
        console.log(`[Store] Updated tasks (${finalTasks.length})`, finalTasks.map(s => ({ id: s.id, messages: s.messages.length })));
        if (updatedActiveTaskId) {
          const conversations = get().getTaskConversations(updatedActiveTaskId);
          console.log(`[Store] Current conversations for active task:`, conversations);
        }
      },
      error: (error) => {
        console.error('Task updates subscription error:', error);
      },
    });
  },

  // 获取任务的对话列表（UI友好格式）
  getTaskConversations: (taskId: string): Conversation[] => {
    const task = get().tasks.find(s => s.id === taskId);
    if (!task) return [];

    console.log(`[Store] Converting task ${taskId} with ${task.messages.length} messages`); // 添加日志

    // 将AgentTask的消息格式转换为Conversation格式
    const conversations: Conversation[] = [];
    let userMessage: schema.Message | null = null;
    let lastProcessedIndex = -1;

    for (let index = 0; index < task.messages.length; index++) {
      const message = task.messages[index];
      console.log(`[Store] Processing message ${index}:`, message.role, message.parts.map(p => 'text' in p ? p.text : '').join(''));

      if (message.role === 'user') {
        // 如果有上一个未处理的用户消息，先创建一个没有回复的对话
        if (userMessage && lastProcessedIndex < index - 1) {
          conversations.push({
            id: `${task.id}-${index - 1}`,
            question: userMessage.parts.map(part => 'text' in part ? part.text : '').join(''),
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
          });
        }

        // 保存新的用户消息
        userMessage = message;
        lastProcessedIndex = index;
      } else if (message.role === 'agent') {
        // 如果这是最后一条消息，或者下一条也是智能体消息
        const isLastMessage = index === task.messages.length - 1;
        const nextIsAgentToo = !isLastMessage && task.messages[index + 1].role === 'agent';

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
            id: `${task.id}-${lastProcessedIndex}-${index}`,
            question: userMessage.parts.map(part => 'text' in part ? part.text : '').join(''),
            response: response,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
          });

          userMessage = null;
          lastProcessedIndex = index;
        }
      }
    }

    // 处理最后一个没有回复的用户消息
    if (userMessage) {
      conversations.push({
        id: `${task.id}-${task.messages.length - 1}`,
        question: userMessage.parts.map(part => 'text' in part ? part.text : '').join(''),
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
    }

    console.log(`[Store] Produced ${conversations.length} conversations`);
    return conversations;
  },

  // 发送消息（简单封装）
  sendMessage: (message: string, taskId?: string) => {
    get().sendMessageToAI(message, taskId);
  },
}));

// 使用React Hook初始化store
export const useAgentStoreInitialization = () => {
  const initialize = useAgentStore(state => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);
};
