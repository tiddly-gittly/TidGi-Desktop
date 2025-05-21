import { create } from 'zustand';
import { basicActionsMiddleware } from './actions/basicActions';
import { previewActionsMiddleware } from './actions/previewActions';
import { streamingActionsMiddleware } from './actions/streamingActions';
import { AgentChatState } from './types';

/**
 * Create and export the agent chat store
 */
export const useAgentChatStore = create<AgentChatState>()((...api) => ({
  // Initial state
  loading: false,
  error: null,
  agent: null,
  messages: new Map(),
  orderedMessageIds: [],
  streamingMessageIds: new Set(),

  // Preview dialog state
  previewDialogOpen: false,
  previewDialogTab: 'flat',
  previewLoading: false,
  previewResult: null,

  // Combine all middlewares
  ...basicActionsMiddleware(...api),
  ...streamingActionsMiddleware(...api),
  ...previewActionsMiddleware(...api),
}));
