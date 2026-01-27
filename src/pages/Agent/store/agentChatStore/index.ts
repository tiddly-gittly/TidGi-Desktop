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
    isCancelling: false,

    // Preview dialog state
    previewDialogOpen: false,
    previewDialogBaseMode: 'preview',
    previewDialogTab: 'tree',
    previewLoading: false,
    previewProgress: 0,
    previewCurrentStep: '',
    previewCurrentPlugin: null,
    previewResult: null,
    lastUpdated: null,
    formFieldsToScrollTo: [],
  };

  // Merge all actions and initial state
  return {
    ...initialState,
    ...basicActions(set, get, api),
    ...streamingActionsMiddleware(set, get, api),
    ...previewActionsMiddleware(set, get, api),
  } as AgentChatStoreType;
});

// Expose store to window object for e2e testing
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'test') {
  (window as any).useAgentChatStore = useAgentChatStore;
}
