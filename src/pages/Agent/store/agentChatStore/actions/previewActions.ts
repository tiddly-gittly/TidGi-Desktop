import type { AgentPromptDescription } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { timeout } from 'rxjs/operators';
import { nanoid } from 'nanoid';
import { StateCreator } from 'zustand';
import { AgentChatStoreType, PreviewActions } from '../types';

/**
 * Preview dialog related actions
 * Handles dialog state and preview generation with real-time updates
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
      previewProgress: undefined,
      previewStep: undefined,
    });
  },

  setPreviewDialogTab: (tab: 'flat' | 'tree') => {
    set({ previewDialogTab: tab });
  },

  setFormFieldsToScrollTo: (fieldIds: string[]) => {
    set({ formFieldsToScrollTo: fieldIds });
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

  toggleArrayItemExpansion: (itemId: string) => {
    const { expandedArrayItems } = get();
    const newMap = new Map(expandedArrayItems);
    
    if (newMap.has(itemId)) {
      newMap.delete(itemId);
    } else {
      newMap.set(itemId, true);
    }
    set({ expandedArrayItems: newMap });
  },

  collapseArrayItem: (itemId: string) => {
    const { expandedArrayItems } = get();
    const newMap = new Map(expandedArrayItems);
    if (newMap.has(itemId)) {
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

  /**
   * Generate preview result with real-time progress updates
   * Shows processing status and intermediate results to the user
   */
  getPreviewPromptResult: async (
    inputText: string,
    promptConfig: AgentPromptDescription['promptConfig'],
  ) => {
    try {
      // Initialize loading state
      set({ 
        previewLoading: true, 
        previewProgress: 0, 
        previewStep: 'Starting...',
        previewResult: null 
      });
      
      const messages = Array.from(get().messages.values());

      // Safety check - if promptConfig is empty, fail early
      if (Object.keys(promptConfig).length === 0) {
        set({ 
          previewLoading: false, 
          previewResult: null,
          previewProgress: undefined,
          previewStep: undefined,
        });
        return null;
      }

      // Add input text as a preview message
      if (inputText.trim()) {
        messages.push({
          id: 'preview-input',
          agentId: 'preview-id',
          role: 'user',
          content: inputText,
          modified: new Date(),
        });
      }

      // Use the streaming API for real-time progress
      const concatStream = window.service.agentInstance.concatPrompt({ promptConfig }, messages);
      
      // Create promise to track completion and provide real-time updates
      return new Promise((resolve, reject) => {
        let finalResult: any = null;
        
        const subscription = concatStream.pipe(
          timeout(15000) // 15 second timeout
        ).subscribe({
          next: (state) => {
            // Update UI with real-time progress
            set({
              previewProgress: state.progress,
              previewStep: state.step,
            });
            
            // Store final result when processing is complete
            if (state.isComplete) {
              finalResult = {
                flatPrompts: state.flatPrompts,
                processedPrompts: state.processedPrompts,
              };
              
              set({
                previewResult: finalResult,
                previewLoading: false,
                lastUpdated: new Date(),
              });
            }
            
            // Log progress for development debugging
            console.log(`🔄 Preview progress: ${Math.round(state.progress * 100)}% - ${state.step}`, {
              currentPlugin: state.currentPlugin?.pluginId,
              flatPromptsCount: state.flatPrompts.length,
              processedPromptsCount: state.processedPrompts.length,
            });
          },
          error: (error: any) => {
            console.error('❌ Error generating preview prompt result:', error);
            set({
              previewResult: null,
              previewLoading: false,
              previewProgress: undefined,
              previewStep: undefined,
            });
            reject(error);
          },
          complete: () => {
            console.log('✅ Preview prompt generation completed');
            set({
              previewLoading: false,
              previewProgress: undefined,
              previewStep: undefined,
            });
            resolve(finalResult);
          },
        });
      });
    } catch (error: any) {
      console.error('❌ Error in preview generation:', error);
      set({
        previewResult: null,
        previewLoading: false,
        previewProgress: undefined,
        previewStep: undefined,
      });
      return null;
    }
  },

  resetLastUpdated: () => {
    set({ lastUpdated: null });
  },
});
