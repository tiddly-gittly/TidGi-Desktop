// Import parameter types from plugin files
import type { ModelContextProtocolParameter } from '@services/agentInstance/plugins/modelContextProtocolPlugin';
import type { DynamicPositionParameter, FullReplacementParameter } from '@services/agentInstance/plugins/promptPlugins';
import type { WikiOperationParameter } from '@services/agentInstance/plugins/wikiOperationPlugin';
import type { WikiSearchParameter } from '@services/agentInstance/plugins/wikiSearchPlugin';
import type { WorkspacesListParameter } from '@services/agentInstance/plugins/workspacesListPlugin';

/**
 * Type definition for prompt concat plugin
 * This includes all possible parameter fields for type safety
 */
export type IPromptConcatPlugin = {
  id: string;
  caption?: string;
  content?: string;
  forbidOverrides?: boolean;
  pluginId: string;

  // Plugin-specific parameters
  fullReplacementParam?: FullReplacementParameter;
  dynamicPositionParam?: DynamicPositionParameter;
  wikiOperationParam?: WikiOperationParameter;
  wikiSearchParam?: WikiSearchParameter;
  workspacesListParam?: WorkspacesListParameter;
  modelContextProtocolParam?: ModelContextProtocolParameter;
};
