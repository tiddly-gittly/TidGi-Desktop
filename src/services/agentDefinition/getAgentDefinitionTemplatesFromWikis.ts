import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import type { ITiddlerFields } from 'tiddlywiki';
import { AgentDefinition, AgentToolConfig } from './interface';

/**
 * Get agent templates from wiki workspaces with tag [$:/tags/AI/Template]
 */
export async function getWikiAgentTemplates(): Promise<AgentDefinition[]> {
  try {
    // Get services from container
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

    // Get all active main wiki workspaces
    const workspaces = await workspaceService.getWorkspacesAsList();
    const activeMainWikiWorkspaces = workspaces.filter(
      (workspace) => isWikiWorkspace(workspace) && workspace.active && !workspace.isSubWiki,
    );

    const wikiTemplates: AgentDefinition[] = [];

    // Process each active main workspace
    for (const workspace of activeMainWikiWorkspaces) {
      try {
        // Query for tiddlers with the AI Template tag
        const templateTiddlers = await wikiService.wikiOperationInServer(
          WikiChannel.getTiddlersAsJson,
          workspace.id,
          ['[tag[$:/tags/AI/Template]]'],
        );

        if (Array.isArray(templateTiddlers)) {
          for (const tiddler of templateTiddlers) {
            const agentTemplate = validateAndConvertWikiTiddlerToAgentTemplate(tiddler, workspace.name);
            if (agentTemplate) {
              wikiTemplates.push(agentTemplate);
            }
          }
        }
      } catch (workspaceError) {
        logger.warn(`Failed to get templates from workspace ${workspace.name}:`, workspaceError);
        // Continue with other workspaces
      }
    }

    return wikiTemplates;
  } catch (error) {
    logger.error(`Failed to get wiki agent templates: ${error as Error}`);
    return []; // Return empty array on error to not break the main functionality
  }
}

/**
 * Validate and convert a wiki tiddler to an AgentDefinition template
 */
export function validateAndConvertWikiTiddlerToAgentTemplate(
  tiddler: ITiddlerFields,
  workspaceName?: string,
): AgentDefinition | null {
  try {
    // Basic validation
    if (!tiddler || !tiddler.title || typeof tiddler.text !== 'string') {
      return null;
    }

    // Try to parse the tiddler text as JSON for agent configuration
    let handlerConfig: Record<string, unknown>;
    try {
      const textContent = typeof tiddler.text === 'string' ? tiddler.text : String(tiddler.text || '{}');
      const parsed = JSON.parse(textContent) as unknown;

      // Ensure handlerConfig is a valid object
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        logger.warn(`Invalid handlerConfig in tiddler ${String(tiddler.title)}: not an object`);
        return null;
      }
      handlerConfig = parsed as Record<string, unknown>;
    } catch (parseError) {
      logger.warn(`Failed to parse agent template from tiddler ${String(tiddler.title)}:`, parseError);
      return null;
    }

    // Helper function to safely get string value from tiddler field
    const getStringField = (field: unknown, fallback = ''): string => {
      if (typeof field === 'string') return field;
      if (field && typeof field === 'object') return JSON.stringify(field);
      return fallback;
    };

    // Helper function to safely parse JSON field
    const parseJsonField = (field: unknown): Record<string, unknown> | unknown[] | undefined => {
      if (typeof field === 'string') {
        try {
          const parsed = JSON.parse(field) as unknown;
          if (typeof parsed === 'object' && parsed !== null) {
            return parsed as Record<string, unknown> | unknown[];
          }
          return undefined;
        } catch {
          return undefined;
        }
      }
      return undefined;
    };

    // Helper function to safely parse AI API config
    const parseAiApiConfig = (field: unknown) => {
      const parsed = parseJsonField(field);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return undefined;
    };

    // Helper function to safely parse agent tools
    const parseAgentTools = (field: unknown): AgentToolConfig[] | undefined => {
      const parsed = parseJsonField(field);
      if (Array.isArray(parsed)) {
        // Validate that all items are valid AgentToolConfig objects
        const validConfigs = parsed.filter((item): item is AgentToolConfig => {
          return typeof item === 'object' && item !== null &&
            typeof (item as Record<string, unknown>).toolId === 'string';
        });
        return validConfigs.length > 0 ? validConfigs : undefined;
      }
      return undefined;
    };

    // Create AgentDefinition from tiddler
    const agentTemplate: AgentDefinition = {
      id: `wiki-template-${getStringField(tiddler.title).replace(/[^a-zA-Z0-9-_]/g, '-')}`,
      name: getStringField(tiddler.caption) || getStringField(tiddler.title),
      description: getStringField(tiddler.description) || `Agent template from ${workspaceName || 'wiki'}`,
      avatarUrl: getStringField(tiddler.avatar_url) || undefined,
      handlerID: getStringField(tiddler.handler_id) || 'basicPromptConcatHandler',
      handlerConfig,
      aiApiConfig: parseAiApiConfig(tiddler.ai_api_config),
      agentTools: parseAgentTools(tiddler.agent_tools),
    };

    logger.debug(`Successfully converted wiki tiddler to agent template: ${agentTemplate.name}`);
    return agentTemplate;
  } catch (error) {
    logger.warn(`Failed to validate and convert wiki tiddler to agent template:`, error);
    return null;
  }
}
