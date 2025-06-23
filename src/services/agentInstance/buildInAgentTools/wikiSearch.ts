import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import { IWorkspaceService } from '@services/workspaces/interface';
import { identity } from 'lodash';
import type { ITiddlerFields } from 'tiddlywiki';
import { z } from 'zod/v4';
import { AgentToolContext, AgentToolResult, IAgentTool } from './interface';

/** Placeholder to trigger VSCode i18nAlly extension to show translated text. */
const t = identity;

/**
 * Parameter schema for Wiki search tool
 */
const WikiSearchParameterSchema = z.object({
  workspaceName: z.string().meta({
    title: t('Schema.WikiSearch.WorkspaceNameTitle'),
    description: t('Schema.WikiSearch.WorkspaceName'),
    example: 'wiki1',
  }),
  filter: z.string().meta({
    title: t('Schema.WikiSearch.FilterTitle'),
    description: t('Schema.WikiSearch.Filter'),
    example: '[tag[example]]',
  }),
  maxResults: z.number().optional().default(10).meta({
    title: t('Schema.WikiSearch.MaxResultsTitle'),
    description: t('Schema.WikiSearch.MaxResults'),
    example: '50',
  }),
  includeText: z.boolean().optional().default(true).meta({
    title: t('Schema.WikiSearch.IncludeTextTitle'),
    description: t('Schema.WikiSearch.IncludeText'),
    example: 'true',
  }),
}).meta({
  title: t('Schema.WikiSearch.Title'),
  description: t('Schema.WikiSearch.Description'),
});

type WikiSearchParameters = z.infer<typeof WikiSearchParameterSchema>;

/**
 * Wiki search tool for retrieving content from TiddlyWiki workspaces
 * This tool can search for tiddlers using filter expressions and return their content
 */
export class WikiSearchTool implements IAgentTool {
  public readonly id = 'wiki-search';
  public readonly name = t('Schema.WikiSearch.Title');
  public readonly description = t('Schema.WikiSearch.Description');
  public readonly parameterSchema = WikiSearchParameterSchema;

  /**
   * Execute the wiki search tool
   */
  public async execute(parameters: unknown, _context?: AgentToolContext): Promise<AgentToolResult> {
    try {
      // Validate parameters
      const validatedParameters = WikiSearchParameterSchema.parse(parameters);

      return await this.searchWiki(validatedParameters);
    } catch (error) {
      logger.error('Error in WikiSearchTool.execute', {
        error: error instanceof Error ? error.message : String(error),
        parameters,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Perform the actual wiki search
   */
  private async searchWiki(parameters: WikiSearchParameters): Promise<AgentToolResult> {
    const { workspaceName, filter, maxResults, includeText } = parameters;

    try {
      // Get Wiki service
      const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
      const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);

      // Look up workspace ID from workspace name
      // For now, assuming workspaceName is actually the workspaceID
      // In a real implementation, you'd lookup the workspace ID by name
      const workspaceID = workspaceName;

      if (!await workspaceService.exists(workspaceID)) {
        return {
          success: false,
          error: `Workspace ${workspaceID} does not exist`,
        };
      }

      logger.debug('Searching Wiki with tool', {
        workspaceID,
        filter,
        maxResults,
        includeText,
      });

      // Retrieve tiddlers using the filter expression
      const tiddlerTitles = await wikiService.wikiOperationInServer(WikiChannel.runFilter, workspaceID, [filter]);

      if (tiddlerTitles.length === 0) {
        return {
          success: true,
          data: {
            results: [],
            totalFound: 0,
          },
          metadata: {
            filter,
            workspaceID,
          },
        };
      }

      // Limit results if needed
      const limitedTitles = tiddlerTitles.slice(0, maxResults);

      logger.debug(`Found ${tiddlerTitles.length} tiddlers, returning ${limitedTitles.length}`, {
        totalFound: tiddlerTitles.length,
        returning: limitedTitles.length,
      });

      // Retrieve full tiddler content if requested
      const results: Array<{ title: string; text?: string; fields?: ITiddlerFields }> = [];

      if (includeText) {
        // Retrieve full tiddler content for each tiddler
        for (const title of limitedTitles) {
          try {
            const tiddlerFields = await wikiService.wikiOperationInServer(WikiChannel.getTiddlersAsJson, workspaceID, [title]);
            if (tiddlerFields.length > 0) {
              results.push({
                title,
                text: tiddlerFields[0].text,
                fields: tiddlerFields[0],
              });
            } else {
              results.push({ title });
            }
          } catch (error) {
            logger.warn(`Error retrieving tiddler content for ${title}`, {
              error: error instanceof Error ? error.message : String(error),
            });
            results.push({ title });
          }
        }
      } else {
        // Just return titles
        for (const title of limitedTitles) {
          results.push({ title });
        }
      }

      return {
        success: true,
        data: {
          results,
          totalFound: tiddlerTitles.length,
          returned: results.length,
        },
        metadata: {
          filter,
          workspaceID,
          maxResults,
          includeText,
        },
      };
    } catch (error) {
      logger.error('Error in WikiSearchTool.searchWiki', {
        error: error instanceof Error ? error.message : String(error),
        workspaceName,
        filter,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search wiki',
      };
    }
  }

  /**
   * Format search results as text for prompt injection
   */
  public static formatResultsAsText(results: AgentToolResult): string {
    if (!results.success || !results.data) {
      return '';
    }

    const data = results.data as { results: Array<{ title: string; text?: string }> };
    let content = '';

    for (const result of data.results) {
      content += `# ${result.title}\n\n`;
      if (result.text) {
        content += `${result.text}\n\n`;
      }
    }

    return content;
  }
}
