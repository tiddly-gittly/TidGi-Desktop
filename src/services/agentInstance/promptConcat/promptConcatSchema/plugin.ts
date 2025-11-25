// Import parameter types from plugin files
import type { ModelContextProtocolParameter } from '@services/agentInstance/tools/modelContextProtocol';
import type { DynamicPositionParameter, FullReplacementParameter } from '@services/agentInstance/tools/prompt';
import type { WikiOperationParameter } from '@services/agentInstance/tools/wikiOperation';
import type { WikiSearchParameter } from '@services/agentInstance/tools/wikiSearch';
import type { WorkspacesListParameter } from '@services/agentInstance/tools/workspacesList';

/**
 * Type definition for prompt concat tool
 * This includes all possible parameter fields for type safety
 */
export type IPromptConcatTool = {
  id: string;
  caption?: string;
  content?: string;
  forbidOverrides?: boolean;
  pluginId: string;

  // Tool-specific parameters
  fullReplacementParam?: FullReplacementParameter;
  dynamicPositionParam?: DynamicPositionParameter;
  wikiOperationParam?: WikiOperationParameter;
  wikiSearchParam?: WikiSearchParameter;
  workspacesListParam?: WorkspacesListParameter;
  modelContextProtocolParam?: ModelContextProtocolParameter;
};
