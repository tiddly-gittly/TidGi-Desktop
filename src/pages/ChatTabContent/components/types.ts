import { CoreMessage } from 'ai';

export interface PreviewMessage {
  role: string;
  content: string;
}

export interface CoreMessageContent {
  text?: string;
  content?: string;
}

/**
 * Convert CoreMessage content to string safely
 */
export function getFormattedContent(content: CoreMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        const typedPart = part as CoreMessageContent;
        if (typedPart.text) return typedPart.text;
        if (typedPart.content) return typedPart.content;
        return '';
      })
      .join('');
  }
  return '';
}
