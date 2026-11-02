/**
 * Desktop adapters for headless agent-management interfaces.
 *
 * Each adapter wraps a Desktop-specific IPC or observable API into
 * the environment-neutral contracts defined in memeloop core.
 *
 * Import these adapters when initializing AgentSessionController,
 * AgentDefinitionEditorController, AgentCreationController, or
 * PromptPreviewController from the Desktop renderer process.
 */

export { createDesktopAgentConversationClient } from './DesktopAgentConversationClient';
export { createDesktopAgentDefinitionRepository } from './DesktopAgentDefinitionRepository';
export { createDesktopAgentInstanceClient } from './DesktopAgentInstanceClient';
export { createDesktopConversationTimelineClient } from './DesktopConversationTimelineClient';
export { createDesktopMessageDetailLoader } from './DesktopMessageDetailLoader';
export { createDesktopPromptPreviewClient } from './DesktopPromptPreviewClient';
export { createDesktopPromptPreviewController } from './DesktopPromptPreviewController';
export type { CreateDesktopPromptPreviewControllerOptions, DesktopPromptPreviewBridge } from './DesktopPromptPreviewController';
export { createDesktopScheduledTaskClient } from './DesktopScheduledTaskClient';

export { DesktopAgentChatTab } from './DesktopAgentChatTab';
