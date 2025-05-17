// Message renderer type definitions

import { AgentInstanceMessage } from '@/services/agentInstance/interface';

/**
 * Interface for message renderer components
 */
export interface MessageRendererProps {
  message: AgentInstanceMessage;
  isUser: boolean;
}

/**
 * Message renderer registration object
 */
export interface MessageRendererRegistration {
  // Unique identifier for this renderer
  id: string;
  // Content type to match (exact match only)
  contentType?: string;
  // Pattern to match against message content
  pattern?: RegExp;
  // Renderer component
  renderer: React.ComponentType<MessageRendererProps>;
  // Priority (higher number = higher priority)
  priority: number;
}
