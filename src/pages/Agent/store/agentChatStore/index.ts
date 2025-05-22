import { create } from 'zustand';

import type { AgentChatStoreType } from './types';
import { basicActions } from './actions/basicActions';
import { streamingActionsMiddleware } from './actions/streamingActions';
import { previewActionsMiddleware } from './actions/previewActions';

/**
 * Create and export the agent chat store
 */
export const useAgentChatStore = create<AgentChatStoreType>()((...api) => ({
  // Initial state
  loading: false,
  error: null,
  agent: null,
  agentDef: null,
  messages: new Map(),
  orderedMessageIds: [],
  streamingMessageIds: new Set(),

  // Preview dialog state
  previewDialogOpen: false,
  previewDialogTab: 'flat',
  previewLoading: false,
  previewResult: null,

  // Combine all middlewares
  ...basicActions(...api),
  ...streamingActionsMiddleware(...api),
  ...previewActionsMiddleware(...api),
}));
