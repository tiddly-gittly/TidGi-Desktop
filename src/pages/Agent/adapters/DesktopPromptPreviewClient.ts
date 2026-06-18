/**
 * DesktopPromptPreviewClient — wraps window.observables.agentInstance.concatPrompt
 * to implement the headless PromptPreviewClient interface.
 */

import type { AgentFrameworkConfig, ChatMessage, PromptPreviewClient } from 'memeloop';

/**
 * Desktop implementation of PromptPreviewClient.
 * Uses the observable-based preview pipeline.
 */
export const createDesktopPromptPreviewClient = (): PromptPreviewClient => ({
  generatePreview: async (
    agentFrameworkConfig: AgentFrameworkConfig,
    messages: ChatMessage[],
    inputText?: string,
    onProgress?: (progress: { progress: number; step: string; currentPlugin?: string }) => void,
  ) => {
    const previewMessages = [...messages];

    if (inputText?.trim()) {
      const now = new Date();
      previewMessages.push({
        messageId: 'preview-input',
        conversationId: 'preview-id',
        originNodeId: 'tidgi-desktop',
        timestamp: now.getTime(),
        lamportClock: now.getTime(),
        role: 'user',
        content: inputText,
      });
    }

    const concatStream = window.observables.agentInstance.concatPrompt(
      { agentFrameworkConfig },
      previewMessages,
    );

    return new Promise((resolve, reject) => {
      let flatPrompts: unknown[] = [];
      let processedPrompts: unknown[] = [];
      let completed = false;

      const subscription = concatStream.subscribe({
        next: (state) => {
          const stepDescription = state.step === 'plugin'
            ? `Processing tool: ${state.currentPlugin?.toolId ?? 'unknown'}`
            : state.step === 'finalize'
            ? 'Finalizing prompts...'
            : state.step === 'flatten'
            ? 'Flattening prompt tree...'
            : 'Completing...';

          onProgress?.({
            progress: (state.progress as number) ?? 0,
            step: stepDescription,
            currentPlugin: state.currentPlugin?.toolId,
          });

          flatPrompts = state.flatPrompts;
          processedPrompts = state.processedPrompts;

          if (state.isComplete) {
            completed = true;
            resolve({
              flatPrompts,
              processedPrompts,
            });
          }
        },

        error: (error) => {
          reject(error as Error);
        },

        complete: () => {
          if (!completed) {
            resolve({
              flatPrompts,
              processedPrompts,
            });
          }
        },
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        if (!completed) {
          subscription.unsubscribe();
          reject(new Error('Preview generation timed out'));
        }
      }, 15000);
    });
  },
});
