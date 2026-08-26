/**
 * Web Fetch Tool — fetches external web content using Electron's net module.
 */
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import { net } from 'electron';
import { convert } from 'html-to-text';
import type { ToolExecutionResult } from 'memeloop';
import { z } from 'zod/v4';
import { defineDesktopTool } from './defineToolDefinition';

export const WebFetchParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
  toolResultDuration: z.number().optional().default(1).meta({ title: 'Tool result duration', description: 'Rounds this result stays in context' }),
  maxContentLength: z.number().optional().default(50000).meta({ title: 'Max content length', description: 'Maximum characters to return from fetched content' }),
}).meta({ title: 'Web Fetch Config', description: 'Configuration for web fetch tool' });

export type WebFetchParameter = z.infer<typeof WebFetchParameterSchema>;

const WebFetchToolSchema = z.object({
  url: z.string().meta({ title: 'URL', description: 'The URL to fetch. Must be http or https.' }),
  extractText: z.boolean().optional().default(true).meta({
    title: 'Extract text',
    description: 'If true, strips HTML tags and returns plain text. If false, returns raw HTML.',
  }),
}).meta({
  title: 'web-fetch',
  description: 'Fetch content from a URL. Returns the page text (HTML tags stripped by default). Useful for referencing external documentation or web resources.',
  examples: [
    { url: 'https://tiddlywiki.com/#HelloThere', extractText: true },
  ],
});

/**
 * Parse HTML rather than filtering it with regular expressions. The parser handles
 * malformed markup without allowing nested or unusual closing tags to bypass the
 * script/style exclusion rules.
 */
export function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
    ],
  })
    // Keep decoded angle brackets inert if this plain-text result is later embedded
    // into HTML or Markdown by an agent consumer.
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function executeWebFetch(parameters: z.infer<typeof WebFetchToolSchema>, maxContentLength: number): Promise<ToolExecutionResult> {
  const { url, extractText } = parameters;

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { success: false, error: `Only http and https URLs are supported. Got: ${parsedUrl.protocol}` };
    }
  } catch {
    return { success: false, error: `Invalid URL: ${url}` };
  }

  logger.debug('Fetching web content', { url });

  try {
    const response = await net.fetch(url, {
      headers: {
        'User-Agent': 'TidGi-Desktop/1.0 (AI Agent Web Fetch)',
        Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
      },
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status} ${response.statusText} for ${url}` };
    }

    let content = await response.text();

    if (extractText) {
      content = htmlToText(content);
    }

    // Truncate if too long
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength) + `\n\n... (truncated, ${content.length} chars total)`;
    }

    return {
      success: true,
      data: content,
      metadata: { url, contentLength: content.length, extractText },
    };
  } catch (error) {
    return { success: false, error: `Fetch failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export const webFetchDefinition = defineDesktopTool({
  toolId: 'webFetch',
  displayName: 'Web Fetch',
  description: 'Fetch content from a URL for external reference',
  configSchema: WebFetchParameterSchema,
  llmToolSchemas: { 'web-fetch': WebFetchToolSchema },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, config, agentFrameworkContext }) {
    if (!toolCall || !toolCall.found || toolCall.toolId !== 'web-fetch') return;
    if (agentFrameworkContext.isCancelled?.()) return;
    const maxLength = config?.maxContentLength ?? 50000;
    await executeToolCall('web-fetch', (parameters) => executeWebFetch(parameters, maxLength));
  },
});
