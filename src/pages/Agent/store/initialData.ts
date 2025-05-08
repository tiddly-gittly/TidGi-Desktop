import { nanoid } from 'nanoid';
import { TabItem, TabState, TabType } from '../types/tab';

/**
 * 创建默认的标签页数据
 */
export const createInitialTabs = (): TabItem[] => {
  const timestamp = Date.now();
  
  return [
    // 新标签页
    {
      id: nanoid(),
      type: TabType.NEW_TAB,
      title: 'agent.tabTitle.newTab',
      state: TabState.ACTIVE,
      isPinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      favorites: [
        { id: nanoid(), title: 'Google', url: 'https://www.google.com', favicon: 'G' },
        { id: nanoid(), title: 'GitHub', url: 'https://github.com', favicon: 'GH' },
        { id: nanoid(), title: 'YouTube', url: 'https://www.youtube.com', favicon: 'YT' },
      ],
    },
    
    // 网页标签页
    {
      id: nanoid(),
      type: TabType.WEB,
      title: 'agent.tabTitle.google',
      state: TabState.INACTIVE,
      isPinned: true,
      createdAt: timestamp - 1000,
      updatedAt: timestamp - 1000,
      url: 'https://www.google.com',
      favicon: 'G',
    },
    
    // 聊天标签页
    {
      id: nanoid(),
      type: TabType.CHAT,
      title: 'agent.tabTitle.aiChat',
      state: TabState.INACTIVE,
      isPinned: false,
      createdAt: timestamp - 2000,
      updatedAt: timestamp - 500,
      messages: [
        {
          id: nanoid(),
          role: 'user',
          content: 'agent.chat.exampleUserMessage',
          timestamp: timestamp - 2000,
        },
        {
          id: nanoid(),
          role: 'assistant',
          content: 'agent.chat.exampleAiMessage',
          timestamp: timestamp - 1800,
        },
      ],
    },
  ];
};