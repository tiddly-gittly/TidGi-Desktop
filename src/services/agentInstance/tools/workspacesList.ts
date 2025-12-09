/**
 * Workspaces List Tool
 * Injects available wiki workspaces list into prompts
 */
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { identity } from 'lodash';
import { z } from 'zod/v4';
import { registerToolDefinition } from './defineTool';

const t = identity;

/**
 * Workspaces List Parameter Schema
 */
export const WorkspacesListParameterSchema = z.object({
  targetId: z.string().meta({
    title: t('Schema.WorkspacesList.TargetIdTitle'),
    description: t('Schema.WorkspacesList.TargetId'),
  }),
  position: z.enum(['before', 'after']).meta({
    title: t('Schema.WorkspacesList.PositionTitle'),
    description: t('Schema.WorkspacesList.Position'),
  }),
}).meta({
  title: t('Schema.WorkspacesList.Title'),
  description: t('Schema.WorkspacesList.Description'),
});

export type WorkspacesListParameter = z.infer<typeof WorkspacesListParameterSchema>;

export function getWorkspacesListParameterSchema() {
  return WorkspacesListParameterSchema;
}

/**
 * Workspaces List Tool Definition
 */
const workspacesListDefinition = registerToolDefinition({
  toolId: 'workspacesList',
  displayName: t('Schema.WorkspacesList.Title'),
  description: t('Schema.WorkspacesList.Description'),
  configSchema: WorkspacesListParameterSchema,

  async onProcessPrompts({ config, toolConfig, findPrompt }) {
    if (!config.targetId) return;

    const target = findPrompt(config.targetId);
    if (!target) {
      logger.warn('Workspaces list target prompt not found', {
        targetId: config.targetId,
        toolId: toolConfig.id,
      });
      return;
    }

    // Get available wikis
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const workspaces = await workspaceService.getWorkspacesAsList();
    const wikiWorkspaces = workspaces.filter(isWikiWorkspace);

    if (wikiWorkspaces.length === 0) {
      logger.debug('No wiki workspaces found to inject', { toolId: toolConfig.id });
      return;
    }

    const workspacesList = wikiWorkspaces
      .map((workspace) => `- ${workspace.name} (ID: ${workspace.id})`)
      .join('\n');
    const workspacesListContent = `Available Wiki Workspaces:\n${workspacesList}`;

    // Insert based on position
    if (!target.prompt.children) {
      target.prompt.children = [];
    }

    const newPrompt = {
      id: `workspaces-list-${toolConfig.id}`,
      caption: 'Available Workspaces',
      text: workspacesListContent,
    };

    if (config.position === 'before') {
      target.prompt.children.unshift(newPrompt);
    } else {
      target.prompt.children.push(newPrompt);
    }

    logger.debug('Workspaces list injected successfully', {
      targetId: config.targetId,
      position: config.position,
      toolId: toolConfig.id,
      workspaceCount: wikiWorkspaces.length,
    });
  },
});

export const workspacesListTool = workspacesListDefinition.tool;
