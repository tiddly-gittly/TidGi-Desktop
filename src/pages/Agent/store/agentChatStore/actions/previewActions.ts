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
    set({ previewDialogOpen: false });
  },

  setPreviewDialogTab: (tab: 'flat' | 'tree' | 'config') => {
    set({ previewDialogTab: tab });
  },

  getPreviewPromptResult: async (
    inputText: string,
    promptConfig: AgentPromptDescription['promptConfig'],
  ) => {
    try {
      console.log('previewActions: Setting previewLoading to true');
      set({ previewLoading: true });
      const messages = Array.from(get().messages.values());
      console.log('previewActions: Got messages', { count: messages.length });

      // Safety check - if promptConfig is empty, fail early
      if (Object.keys(promptConfig).length === 0) {
        console.error('previewActions: Empty promptConfig provided');
        set({ previewLoading: false, previewResult: null });
        return null;
      }

      if (inputText.trim()) {
        console.log('previewActions: Adding input text to messages', { textLength: inputText.length });
        messages.push({
          id: 'preview-input',
          agentId: 'preview-id',
          role: 'user',
          content: inputText,
          modified: new Date(),
        });
      }

      // Get preview result
      console.log('previewActions: Calling concatPrompt', {
        promptConfigKeys: Object.keys(promptConfig),
        messages,
      });

      // Add a timeout to the concatPrompt call to prevent hanging
      let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn('previewActions: concatPrompt call timed out after 15 seconds');
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
        console.error('previewActions: concatPrompt timed out');
        return null;
      }

      console.log('previewActions: Got result from concatPrompt', {
        success: !!result,
        flatPromptsCount: result.flatPrompts.length,
        processedPromptsCount: result.processedPrompts.length,
      });

      // Update state and return result
      set({
        previewResult: result,
        previewLoading: false,
      });
      console.log('previewActions: Set previewLoading to false');
      return result;
    } catch (error) {
      console.error('previewActions: Failed to generate preview:', error);
      set({
        previewResult: null,
        previewLoading: false,
      });
      console.log('previewActions: Set previewLoading to false after error');
      return null;
    }
  },
});
