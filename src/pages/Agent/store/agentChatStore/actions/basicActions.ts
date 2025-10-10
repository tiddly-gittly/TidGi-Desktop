import type { StoreApi } from 'zustand';
import type { AgentChatStoreType } from '../types';
import { agentActions } from './agentActions';
import { messageActions } from './messageActions';
import { streamingActionsMiddleware } from './streamingActions';

export const basicActions = (
  set: StoreApi<AgentChatStoreType>['setState'],
  get: StoreApi<AgentChatStoreType>['getState'],
  api: StoreApi<AgentChatStoreType>,
) => ({
  ...agentActions(set, get),
  ...messageActions(set, get),
  ...streamingActionsMiddleware(set, get, api),

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
