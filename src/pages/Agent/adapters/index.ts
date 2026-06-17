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

export { createDesktopAgentDefinitionRepository } from './DesktopAgentDefinitionRepository';
export { createDesktopAgentInstanceClient } from './DesktopAgentInstanceClient';
export { createDesktopAgentConversationClient } from './DesktopAgentConversationClient';
export { createDesktopPromptPreviewClient } from './DesktopPromptPreviewClient';
export { createDesktopScheduledTaskClient } from './DesktopScheduledTaskClient';
