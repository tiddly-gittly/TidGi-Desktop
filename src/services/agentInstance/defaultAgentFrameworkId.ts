/**
 * When an agent definition omits `agentFrameworkID`, main-process `sendMsgToAgent` falls back to this handler.
 * Renderer and preferences should use the same value so prompt schema and chat routing stay aligned.
 */
export const DEFAULT_AGENT_FRAMEWORK_ID = 'memeloopTaskAgentWorker';
