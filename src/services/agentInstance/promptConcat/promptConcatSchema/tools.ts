// Import parameter types from plugin files
// Modifiers
import type { DynamicPositionParameter, FullReplacementParameter } from '../modifiers';
// LLM Tools
import type { ModelContextProtocolParameter } from '@services/agentInstance/tools/modelContextProtocol';
import type { WikiOperationParameter } from '@services/agentInstance/tools/wikiOperation';
import type { WikiSearchParameter } from '@services/agentInstance/tools/wikiSearch';
import type { WorkspacesListParameter } from '@services/agentInstance/tools/workspacesList';

/**
 * Type definition for prompt concat plugin (both modifiers and LLM tools)
 * This includes all possible parameter fields for type safety
 */
export type IPromptConcatTool = {
  id: string;
  caption?: string;
  content?: string;
  forbidOverrides?: boolean;
  toolId: string;

  // Modifier parameters
  fullReplacementParam?: FullReplacementParameter;
  dynamicPositionParam?: DynamicPositionParameter;

  // LLM Tool parameters
  wikiOperationParam?: WikiOperationParameter;
  wikiSearchParam?: WikiSearchParameter;
  workspacesListParam?: WorkspacesListParameter;
  modelContextProtocolParam?: ModelContextProtocolParameter;
};
