import type { AgentPromptDescription, IPrompt } from '@services/agentInstance/promptConcat/promptConcatSchema';
import type { ModelMessage } from 'ai';
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

  updatePreviewProgress: (progress: number, step: string, currentPlugin?: string) => {
    set({
      previewProgress: progress,
      previewCurrentStep: step,
      previewCurrentPlugin: currentPlugin || null,
    });
  },

  getPreviewPromptResult: async (
    inputText: string,
    agentFrameworkConfig: AgentPromptDescription['agentFrameworkConfig'],
  ) => {
    try {
      set({ previewLoading: true });
      const messages = Array.from(get().messages.values());

      // Safety check - if agentFrameworkConfig is empty, fail early
      if (!agentFrameworkConfig || Object.keys(agentFrameworkConfig).length === 0) {
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

      // Use the streaming API with progress updates
      const concatStream = window.observables.agentInstance.concatPrompt({ agentFrameworkConfig }, messages);

      // Initialize progress
      set({
        previewProgress: 0,
        previewCurrentStep: 'Starting...',
        previewCurrentPlugin: null,
      });

      type PreviewResult = { flatPrompts: ModelMessage[]; processedPrompts: IPrompt[] } | null;
      let finalResult: PreviewResult = null;
      let completed = false;

      // Create a promise that resolves when the stream completes
      const streamPromise = new Promise<PreviewResult>((resolve, reject) => {
        // Subscribe to the stream and update progress in real-time
        const subscription = concatStream.subscribe({
          next: (state) => {
            // Update progress and current step
            const stepDescription = state.step === 'plugin'
              ? `Processing tool: ${state.currentPlugin?.toolId || 'unknown'}`
              : state.step === 'finalize'
              ? 'Finalizing prompts...'
              : state.step === 'flatten'
              ? 'Flattening prompt tree...'
              : 'Completing...';

            set({
              previewProgress: state.progress,
              previewCurrentStep: stepDescription,
              previewCurrentPlugin: state.currentPlugin?.toolId || null,
              // Update intermediate results
              previewResult: {
                flatPrompts: state.flatPrompts,
                processedPrompts: state.processedPrompts,
              },
            });

            // Store final result
            if (state.isComplete) {
              finalResult = {
                flatPrompts: state.flatPrompts,
                processedPrompts: state.processedPrompts,
              };
            }
          },
          error: (error) => {
            console.error('Error generating preview prompt result:', error);
            set({
              previewResult: null,
              previewLoading: false,
              previewProgress: 0,
              previewCurrentStep: 'Error occurred',
              previewCurrentPlugin: null,
            });
            reject(error as Error);
          },
          complete: () => {
            completed = true;
            set({
              previewResult: finalResult,
              previewLoading: false,
              previewProgress: 1,
              previewCurrentStep: 'Complete',
              previewCurrentPlugin: null,
              lastUpdated: new Date(),
            });
            resolve(finalResult);
          },
        });

        // Set up timeout
        setTimeout(() => {
          if (!completed) {
            subscription.unsubscribe();
            set({
              previewResult: null,
              previewLoading: false,
              previewProgress: 0,
              previewCurrentStep: 'Timeout',
              previewCurrentPlugin: null,
            });
            reject(new Error('Preview generation timed out'));
          }
        }, 15000);
      });

      return await streamPromise;
    } catch (_error: unknown) {
      console.error('Error generating preview prompt result:', _error);
      void _error;
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
