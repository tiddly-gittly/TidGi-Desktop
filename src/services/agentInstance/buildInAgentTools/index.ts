export { AgentToolContext, AgentToolRegistration, AgentToolResult, IAgentTool, IAgentToolRegistry } from './interface';
export { AgentToolRegistry } from './registry';
export { WikiSearchTool } from './wikiSearch';

// Global tool registry instance
import { AgentToolRegistry } from './registry';
import { WikiSearchTool } from './wikiSearch';

export const globalToolRegistry = new AgentToolRegistry();

// Register built-in tools
globalToolRegistry.registerTool(new WikiSearchTool(), {
  tags: ['wiki', 'search', 'retrieval'],
  enabled: true,
});
