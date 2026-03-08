/**
 * Wiki Get Errors Tool — renders a tiddler and captures any rendering errors/warnings.
 */
import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import { t } from '@services/libs/i18n/placeholder';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { z } from 'zod/v4';
import { registerToolDefinition, type ToolExecutionResult } from './defineTool';

export const GetErrorsParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
  toolResultDuration: z.number().optional().default(1).meta({ title: 'Tool result duration', description: 'Rounds this result stays in context' }),
}).meta({ title: 'Get Errors Config', description: 'Configuration for wiki render errors tool' });

export type GetErrorsParameter = z.infer<typeof GetErrorsParameterSchema>;

const GetErrorsToolSchema = z.object({
  workspaceName: z.string().meta({ title: 'Workspace name', description: 'Wiki workspace name or ID' }),
  title: z.string().meta({ title: 'Tiddler title', description: 'The tiddler to render and check for errors' }),
}).meta({
  title: 'wiki-get-errors',
  description: 'Render a tiddler and check for rendering errors or warnings. Useful for debugging broken wikitext.',
  examples: [{ workspaceName: 'My Wiki', title: 'My Broken Note' }],
});

async function executeGetErrors(parameters: z.infer<typeof GetErrorsToolSchema>): Promise<ToolExecutionResult> {
  const { workspaceName, title } = parameters;
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);

  const workspaces = await workspaceService.getWorkspacesAsList();
  const target = workspaces.find(ws => ws.name === workspaceName || ws.id === workspaceName);
  if (!target) {
    return { success: false, error: `Workspace "${workspaceName}" not found. Available: ${workspaces.map(w => w.name).join(', ')}` };
  }

  try {
    // Get tiddler text first
    const tiddlers = await wikiService.wikiOperationInServer(WikiChannel.getTiddlersAsJson, target.id, [title]);
    if (!tiddlers || tiddlers.length === 0) {
      return { success: false, error: `Tiddler "${title}" not found in workspace "${workspaceName}".` };
    }

    const tiddlerText = tiddlers[0]?.text ?? '';

    // Attempt to render — any error in renderText will be caught
    try {
      const rendered = await wikiService.wikiOperationInServer(WikiChannel.renderWikiText, target.id, [tiddlerText]);

      // Check rendered HTML for common error patterns
      const errorPatterns = [
        /<span class="tc-error">(.*?)<\/span>/g,
        /Error:/gi,
        /undefined widget/gi,
        /Missing tiddler/gi,
        /Recursive transclusion/gi,
      ];

      const errors: string[] = [];
      for (const pattern of errorPatterns) {
        let match;
        while ((match = pattern.exec(rendered)) !== null) {
          errors.push(match[1] || match[0]);
        }
      }

      if (errors.length > 0) {
        return {
          success: true,
          data: `Found ${errors.length} potential issue(s) when rendering "${title}":\n${errors.map((errorItem, index) => `${index + 1}. ${errorItem}`).join('\n')}`,
          metadata: { workspaceName, title, errorCount: errors.length },
        };
      }

      return {
        success: true,
        data: `No rendering errors detected for "${title}" in workspace "${workspaceName}". The tiddler renders cleanly.`,
        metadata: { workspaceName, title, errorCount: 0 },
      };
    } catch (renderError) {
      return {
        success: true,
        data: `Rendering error for "${title}": ${renderError instanceof Error ? renderError.message : String(renderError)}`,
        metadata: { workspaceName, title, renderError: true },
      };
    }
  } catch (error) {
    return { success: false, error: `Failed to check errors: ${error instanceof Error ? error.message : String(error)}` };
  }
}

const getErrorsDefinition = registerToolDefinition({
  toolId: 'getErrors',
  displayName: 'Wiki Get Errors',
  description: 'Render a tiddler and check for rendering errors or warnings',
  configSchema: GetErrorsParameterSchema,
  llmToolSchemas: { 'wiki-get-errors': GetErrorsToolSchema },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall || toolCall.toolId !== 'wiki-get-errors') return;
    if (agentFrameworkContext.isCancelled()) return;
    await executeToolCall('wiki-get-errors', executeGetErrors);
  },
});

export const getErrorsTool = getErrorsDefinition.tool;
