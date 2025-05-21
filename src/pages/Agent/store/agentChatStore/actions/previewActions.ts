import type { AgentPromptDescription, AiAPIConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { StateCreator } from 'zustand';
import { AgentChatState, PreviewActions } from '../types';

/**
 * Preview dialog related actions
 * Handles dialog state and preview generation
 */
export const previewActionsMiddleware: StateCreator<AgentChatState, [], [], PreviewActions> = (
  set,
  get,
) => ({
  openPreviewDialog: () => {
    set({ previewDialogOpen: true });
  },

  closePreviewDialog: () => {
    set({ previewDialogOpen: false });
  },

  setPreviewDialogTab: (tab: 'flat' | 'tree') => {
    set({ previewDialogTab: tab });
  },

  getPreviewPromptResult: async (
    agentId: string,
    agentDefinitionId: string,
    inputText: string,
    aiApiConfig?: AiAPIConfig,
  ) => {
    try {
      set({ previewLoading: true });
      const messages = Array.from(get().messages.values());

      if (inputText.trim()) {
        messages.push({
          id: 'preview-input',
          agentId,
          role: 'user',
          content: inputText,
          modified: new Date(),
        });
      }

      const promptDescription: AgentPromptDescription = {
        id: agentDefinitionId,
        api: aiApiConfig?.api || { provider: '', model: '' },
        modelParameters: aiApiConfig?.modelParameters || {},
        promptConfig: {} as AgentPromptDescription['promptConfig'],
      };

      // 获取预览结果
      const result = await window.service.agentInstance.concatPrompt(promptDescription, messages);

      // 更新状态并返回结果
      set({
        previewResult: result,
        previewLoading: false,
      });
      return result;
    } catch (error) {
      set({
        previewResult: null,
        previewLoading: false,
      });
      console.error('Failed to generate preview:', error);
      return null;
    }
  },
});
