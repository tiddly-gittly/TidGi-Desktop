import { getWorkflowViewModelStore, WorkflowViewModelStoreState } from '@services/workflow/viewModelStore';
import { useStore } from 'zustand';

export const debugChatStore = getWorkflowViewModelStore();
export function useDebugChatStore<T>(selector: (state: WorkflowViewModelStoreState) => T) {
  return useStore(debugChatStore, selector);
}
