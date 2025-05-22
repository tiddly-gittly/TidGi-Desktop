import type { StoreApi } from 'zustand';
import type { AgentChatStoreType } from '../types';
import { agentActions } from './agentActions';
import { messageActions } from './messageActions';
import { streamActions } from './streamActions';

export const basicActions = (
  set: StoreApi<AgentChatStoreType>['setState'],
  get: StoreApi<AgentChatStoreType>['getState'],
) => ({
  ...agentActions(set, get),
  ...messageActions(set, get),
  ...streamActions(set, get),

  setLoading: (loading: boolean) => {
    set({ loading });
  },

  setError: (error: Error | null) => {
    set({ error });
  },

  clearError: () => {
    set({ error: null });
  },
});
