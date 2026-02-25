import { logger } from '@services/libs/log';
import JSON5 from 'json5';
import { ToolCallingMatch } from './interface';

interface ToolPattern {
  name: string;
  pattern: RegExp;
  extractToolId: (match: RegExpExecArray) => string;
  extractParams: (match: RegExpExecArray) => string;
  extractOriginalText: (match: RegExpExecArray) => string;
}

const MAX_FALLBACK_INPUT_LENGTH = 1000;
/**
 * Parse tool parameters from text content
 * Supports JSON and JSON5 (relaxed JSON) formats
 *
 * This function does NOT execute any code - it only parses data formats.
 * The use of JSON5 allows parsing of common AI mistakes like:
 * - Trailing commas: { "key": "value", }
 * - Single quotes: { 'key': 'value' }
 * - Unquoted keys: { key: "value" }
 * - Comments in JSON
 */
function parseToolParameters(parametersText: string): Record<string, unknown> {
  if (!parametersText || !parametersText.trim()) {
    return {};
  }

  const trimmedText = parametersText.trim();

  // Try standard JSON parsing first (fastest and most secure)
  try {
    return JSON.parse(trimmedText) as Record<string, unknown>;
  } catch {
    // JSON parsing failed, try JSON5
  }

  // Try JSON5 parsing (handles relaxed JSON syntax)
  // JSON5 is a superset of JSON that supports:
  // - Single quotes, unquoted keys, trailing commas, comments, etc.
  // - Pure data parsing, NO code execution
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON5.parse(trimmedText);
    logger.debug('Successfully parsed parameters using JSON5', {
      original: trimmedText.substring(0, 100),
      parsed: typeof parsed,
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return parsed;
  } catch (json5Error) {
    logger.debug('Failed to parse parameters as JSON/JSON5', {
      original: trimmedText.substring(0, 100),
      error: json5Error instanceof Error ? json5Error.message : String(json5Error),
    });
  }

  // Return as single parameter if all parsing failed
  // Limit length to prevent potential issues
  logger.debug('All parsing methods failed, returning as raw input', {
    original: trimmedText.substring(0, 100),
  });
  return { input: trimmedText.substring(0, MAX_FALLBACK_INPUT_LENGTH) };
}

/**
 * Tool calling patterns supported by the system
 */
const toolPatterns: ToolPattern[] = [
  {
    name: 'tool_use',
    pattern: /<tool_use\s+name="([^"]+)"[^>]*>(.*?)<\/tool_use>/gis,
    extractToolId: (match) => match[1],
    extractParams: (match) => match[2],
    extractOriginalText: (match) => match[0],
  },
  {
    name: 'function_call',
    pattern: /<function_call\s+name="([^"]+)"[^>]*>(.*?)<\/function_call>/gis,
    extractToolId: (match) => match[1],
    extractParams: (match) => match[2],
    extractOriginalText: (match) => match[0],
  },
];

/**
 * Match tool calling patterns in AI response text
 * Supports various formats: <tool_use>, <function_call>, etc.
 * Returns only the FIRST match.
 */
export function matchToolCalling(responseText: string): ToolCallingMatch {
  try {
    for (const toolPattern of toolPatterns) {
      toolPattern.pattern.lastIndex = 0;

      const match = toolPattern.pattern.exec(responseText);
      if (match) {
        const toolId = toolPattern.extractToolId(match);
        const parametersText = toolPattern.extractParams(match);
        const originalText = toolPattern.extractOriginalText(match);

        return {
          found: true,
          toolId,
          parameters: parseToolParameters(parametersText),
          originalText,
        };
      }
    }

    return { found: false };
  } catch (error) {
    logger.error(`Failed to match tool calling: ${error as Error}`);
    return { found: false };
  }
}

/**
 * Match ALL tool calling patterns in AI response text.
 * Returns an array of all matches found (empty array if none).
 * Also detects <parallel_tool_calls> wrapper — when present, the caller should execute tools concurrently.
 */
export function matchAllToolCallings(responseText: string): { calls: Array<ToolCallingMatch & { found: true }>; parallel: boolean } {
  const calls: Array<ToolCallingMatch & { found: true }> = [];
  const parallel = /<parallel_tool_calls>/i.test(responseText);

  try {
    for (const toolPattern of toolPatterns) {
      toolPattern.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = toolPattern.pattern.exec(responseText)) !== null) {
        calls.push({
          found: true,
          toolId: toolPattern.extractToolId(match),
          parameters: parseToolParameters(toolPattern.extractParams(match)),
          originalText: toolPattern.extractOriginalText(match),
        });
      }
    }
  } catch (error) {
    logger.error(`Failed to match all tool callings: ${error as Error}`);
  }

  return { calls, parallel };
}

/**
 * Get all supported tool patterns
 */
export function getToolPatterns(): ToolPattern[] {
  return [...toolPatterns];
}

/**
 * Add a new tool pattern
 */
export function addToolPattern(pattern: ToolPattern): void {
  toolPatterns.push(pattern);
}
