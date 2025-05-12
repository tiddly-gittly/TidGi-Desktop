import { nanoid } from 'nanoid';
import { TabItem, TabState, TabType } from '../types/tab';

/**
 * Create default tab data
 */
export const createInitialTabs = (): TabItem[] => {
  const timestamp = Date.now();

  return [
    // New tab
    {
      id: nanoid(),
      type: TabType.NEW_TAB,
      title: 'Default New Tab Test',
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

    // Web tab
    {
      id: nanoid(),
      type: TabType.WEB,
      title: 'Default Web Tab Test',
      state: TabState.INACTIVE,
      isPinned: true,
      createdAt: timestamp - 1000,
      updatedAt: timestamp - 1000,
      url: 'https://www.google.com',
      favicon: 'G',
    },
  ];
};
