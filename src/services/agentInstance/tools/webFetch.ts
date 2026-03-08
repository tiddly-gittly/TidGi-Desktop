/**
 * Web Fetch Tool — fetches external web content using Electron's net module.
 */
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import { net } from 'electron';
import { z } from 'zod/v4';
import { registerToolDefinition, type ToolExecutionResult } from './defineTool';

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
 * Robust HTML to text conversion — removes all tags and decodes entities safely.
 * Applies tag removal in a loop to handle encoded or nested tags that reappear after entity decoding.
 */
function htmlToText(html: string): string {
  let text = html
    // Remove script and style blocks (tolerant of whitespace in closing tags)
    .replace(/<script\b[^>]*>[\s\S]*?<\/\s*script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/\s*style\s*>/gi, '')
    // Convert block elements to newlines
    .replace(/<\/?(p|div|h[1-6]|br|li|tr|td|th|blockquote|pre|hr)\b[^>]*>/gi, '\n')
    // Remove remaining tags
    .replace(/<[^>]+>/g, '');

  // Decode entities that are safe (won't reintroduce HTML structure)
  text = text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Decode &amp; last so sequences like &amp;lt; don't double-unescape
    .replace(/&amp;/g, '&');
  // Intentionally do NOT decode &lt; / &gt; — keeping them as literal text
  // prevents reintroduction of HTML tags from doubly-encoded content.

  // Defense-in-depth: strip any tags that may have been reintroduced by entity decoding
  text = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/\s*script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/\s*style\s*>/gi, '')
    .replace(/<[^>]+>/g, '');

  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function executeWebFetch(parameters: z.infer<typeof WebFetchToolSchema>, maxContentLength: number): Promise<ToolExecutionResult> {
  const { url, extractText = true } = parameters;

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

const webFetchDefinition = registerToolDefinition({
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
    if (!toolCall || toolCall.toolId !== 'web-fetch') return;
    if (agentFrameworkContext.isCancelled()) return;
    const maxLength = config?.maxContentLength ?? 50000;
    await executeToolCall('web-fetch', (parameters) => executeWebFetch(parameters, maxLength));
  },
});

export const webFetchTool = webFetchDefinition.tool;
