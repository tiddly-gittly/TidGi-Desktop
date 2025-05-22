import { create } from 'zustand';
import { basicActions } from './actions/basicActions';
import { previewActionsMiddleware } from './actions/previewActions';
import { streamingActionsMiddleware } from './actions/streamingActions';
import type { AgentChatStoreType } from './types';

/**
 * Create and export the agent chat store
 */
export const useAgentChatStore = create<AgentChatStoreType>()((set, get, api) => {
  const initialState: Partial<AgentChatStoreType> = {
    loading: false,
    error: null,
    agent: null,
    agentDef: null,
    messages: new Map(),
    orderedMessageIds: [],
    streamingMessageIds: new Set<string>(),

    // Preview dialog state
    previewDialogOpen: false,
    previewDialogTab: 'flat',
    previewLoading: false,
    previewResult: null,
  };

  // 合并所有 actions 和初始状态
  return {
    ...initialState,
    ...basicActions(set, get, api),
    ...streamingActionsMiddleware(set, get, api),
    ...previewActionsMiddleware(set, get, api),
  } as AgentChatStoreType;
});
