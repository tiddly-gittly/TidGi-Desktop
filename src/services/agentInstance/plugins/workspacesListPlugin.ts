/**
 * Workspaces List plugin
 * Handles injection of available wiki workspaces list into prompts
 */
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWorkspaceService } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';

import { findPromptById } from '../promptConcat/promptConcat';
import type { PromptConcatPlugin } from './types';

/**
 * Workspaces List plugin - Prompt processing
 * Handles injection of available wiki workspaces list
 */
export const workspacesListPlugin: PromptConcatPlugin = (hooks) => {
  // Tool list injection
  hooks.processPrompts.tapAsync('workspacesListPlugin-injection', async (context, callback) => {
    const { pluginConfig, prompts } = context;

    if (pluginConfig.pluginId !== 'workspacesList' || !pluginConfig.workspacesListParam) {
      callback();
      return;
    }

    const workspacesListParameter = pluginConfig.workspacesListParam;

    try {
      // Handle workspaces list injection if targetId is configured
      if (workspacesListParameter.targetId) {
        const target = findPromptById(prompts, workspacesListParameter.targetId);
        if (!target) {
          logger.warn('Workspaces list target prompt not found', {
            targetId: workspacesListParameter.targetId,
            pluginId: pluginConfig.id,
          });
          callback();
          return;
        }

        // Get available wikis
        const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
        const workspaces = await workspaceService.getWorkspacesAsList();
        const wikiWorkspaces = workspaces.filter(isWikiWorkspace);

        if (wikiWorkspaces.length > 0) {
          // Use fixed list format for simplicity
          const workspacesList = wikiWorkspaces
            .map(workspace => `- ${workspace.name} (ID: ${workspace.id})`)
            .join('\n');

          const workspacesListContent = `Available Wiki Workspaces:\n${workspacesList}`;

          // Insert the workspaces list content based on position
          if (workspacesListParameter.position === 'after') {
            if (!target.prompt.children) {
              target.prompt.children = [];
            }
            const insertIndex = target.prompt.children.length;
            target.prompt.children.splice(insertIndex, 0, {
              id: `workspaces-list-${pluginConfig.id}`,
              caption: 'Available Workspaces',
              text: workspacesListContent,
            });
          } else if (workspacesListParameter.position === 'before') {
            if (!target.prompt.children) {
              target.prompt.children = [];
            }
            target.prompt.children.unshift({
              id: `workspaces-list-${pluginConfig.id}`,
              caption: 'Available Workspaces',
              text: workspacesListContent,
            });
          } else {
            // Default to appending text
            target.prompt.text = (target.prompt.text || '') + '\n' + workspacesListContent;
          }

          logger.debug('Workspaces list injected successfully', {
            targetId: workspacesListParameter.targetId,
            position: workspacesListParameter.position,
            pluginId: pluginConfig.id,
            workspaceCount: wikiWorkspaces.length,
          });
        } else {
          logger.debug('No wiki workspaces found to inject', {
            pluginId: pluginConfig.id,
          });
        }
      }

      callback();
    } catch (error) {
      logger.error('Error in workspaces list injection', {
        error: error instanceof Error ? error.message : String(error),
        pluginId: pluginConfig.id,
      });
      callback();
    }
  });
};
