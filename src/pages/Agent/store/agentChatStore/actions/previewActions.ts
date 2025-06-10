import type { AgentPromptDescription } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { StateCreator } from 'zustand';
import { AgentChatStoreType, PreviewActions } from '../types';

/**
 * Preview dialog related actions
 * Handles dialog state and preview generation
 */
export const previewActionsMiddleware: StateCreator<AgentChatStoreType, [], [], PreviewActions> = (
  set,
  get,
) => ({
  openPreviewDialog: () => {
    set({ previewDialogOpen: true });
  },

  closePreviewDialog: () => {
    set({
      previewDialogOpen: false,
      lastUpdated: null,
      expandedArrayItems: new Map(),
      formFieldsToScrollTo: [],
    });
  },

  setPreviewDialogTab: (tab: 'flat' | 'tree') => {
    set({ previewDialogTab: tab });
  },

  setFormFieldsToScrollTo: (fieldPaths: string[]) => {
    set({ formFieldsToScrollTo: fieldPaths });
  },
  setArrayItemExpanded: (itemId: string, expanded: boolean) => {
    const { expandedArrayItems } = get();
    const newMap = new Map(expandedArrayItems);
    if (expanded) {
      newMap.set(itemId, true);
    } else {
      newMap.delete(itemId);
    }
    set({ expandedArrayItems: newMap });
  },
  isArrayItemExpanded: (itemId: string) => {
    const { expandedArrayItems } = get();
    return expandedArrayItems.get(itemId) ?? false;
  },
  expandPathToTarget: (targetPath: string[]) => {
    const { expandedArrayItems } = get();
    const newMap = new Map(expandedArrayItems);

    // For a path like ['prompts', 'system', 'children', 'default-main']
    // We need to expand each ID that represents an array item: 'system' and 'default-main'
    for (let index = 1; index < targetPath.length; index += 1) {
      if (targetPath[index]) {
        newMap.set(targetPath[index], true);
      }
    }

    set({ expandedArrayItems: newMap });
  },

  getPreviewPromptResult: async (
    inputText: string,
    promptConfig: AgentPromptDescription['promptConfig'],
  ) => {
    try {
      set({ previewLoading: true });
      const messages = Array.from(get().messages.values());

      // Safety check - if promptConfig is empty, fail early
      if (Object.keys(promptConfig).length === 0) {
        set({ previewLoading: false, previewResult: null });
        return null;
      }

      if (inputText.trim()) {
        messages.push({
          id: 'preview-input',
          agentId: 'preview-id',
          role: 'user',
          content: inputText,
          modified: new Date(),
        });
      }

      // Add a timeout to the concatPrompt call to prevent hanging
      let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve(null);
        }, 15000); // 15 second timeout - increased from 10s to give more time for processing
      });

      const concatPromptPromise = window.service.agentInstance.concatPrompt({ promptConfig }, messages);

      // Race the promises
      const result = await Promise.race([concatPromptPromise, timeoutPromise]);

      // Clear the timeout
      clearTimeout(timeoutId);

      if (result === null) {
        // Timeout occurred
        set({
          previewResult: null,
          previewLoading: false,
        });
        return null;
      }

      set({
        previewResult: result,
        previewLoading: false,
        lastUpdated: new Date(),
      });
      return result;
    } catch (error) {
      console.error('Error generating preview prompt result:', error);
      set({
        previewResult: null,
        previewLoading: false,
      });
      return null;
    }
  },

  resetLastUpdated: () => {
    set({ lastUpdated: null });
  },
});
