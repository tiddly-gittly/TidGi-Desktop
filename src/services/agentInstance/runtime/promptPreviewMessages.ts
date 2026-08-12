import type { ModelMessage } from '@services/externalAPI/interface';
import type { ChatMessage } from 'memeloop';

function chatMessageToPreviewMessage(message: ChatMessage): ModelMessage {
  const role = message.role === 'agent' || message.role === 'error'
    ? 'assistant'
    : message.role === 'tool'
    ? 'tool'
    : message.role === 'user'
    ? 'user'
    : 'assistant';
  if (role === 'tool') return { role, content: message.content };
  return { role, content: message.content };
}

/**
 * Mirror MemeLoop's real `buildLlmMessages` ordering in the prompt preview:
 * prompt/plugin output first, then the complete conversation history. The
 * prompt concatenator projects the latest user message itself, so remove that
 * one projection before appending the canonical history to avoid duplication.
 */
export function includeConversationHistoryInPreview(
  flatPrompts: ModelMessage[],
  history: ChatMessage[],
): ModelMessage[] {
  const promptsWithoutTrailingUser = flatPrompts.at(-1)?.role === 'user'
    ? flatPrompts.slice(0, -1)
    : flatPrompts;
  return [...promptsWithoutTrailingUser, ...history.map(chatMessageToPreviewMessage)];
}
