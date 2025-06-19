import { logger } from '@services/libs/log';
import { ToolCallingMatch } from './interface';

interface ToolPattern {
  name: string;
  pattern: RegExp;
  extractToolId: (match: RegExpExecArray) => string;
  extractParams: (match: RegExpExecArray) => string;
  extractOriginalText: (match: RegExpExecArray) => string;
}

/**
 * Parse tool parameters from text content
 * Supports JSON, YAML-like, and key-value formats
 */
function parseToolParameters(parametersText: string): Record<string, unknown> {
  if (!parametersText || !parametersText.trim()) {
    return {};
  }

  const trimmedText = parametersText.trim();

  // Try JSON parsing first
  try {
    return JSON.parse(trimmedText) as Record<string, unknown>;
  } catch {
    // JSON parsing failed, try other formats
  }

  // Check which format is most likely being used
  const lines = trimmedText.split('\n').map(line => line.trim()).filter(Boolean);
  const hasEqualSigns = lines.some(line => line.includes('='));
  const hasColons = lines.some(line => line.includes(':'));

  // If we have equal signs, prefer key=value parsing
  if (hasEqualSigns) {
    const kvResult: Record<string, unknown> = {};
    let hasValidKvPairs = false;

    for (const line of lines) {
      const equalIndex = line.indexOf('=');
      if (equalIndex > 0) {
        const key = line.slice(0, equalIndex).trim();
        const value = line.slice(equalIndex + 1).trim();
        // Try to parse as JSON value, fallback to string
        try {
          kvResult[key] = JSON.parse(value);
        } catch {
          kvResult[key] = value;
        }
        hasValidKvPairs = true;
      }
    }

    if (hasValidKvPairs) {
      return kvResult;
    }
  }

  // Try YAML-like parsing (key: value) if no equal signs or equal parsing failed
  if (hasColons) {
    const result: Record<string, unknown> = {};
    let hasValidYamlPairs = false;

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        // Try to parse as JSON value, fallback to string
        try {
          result[key] = JSON.parse(value);
        } catch {
          result[key] = value;
        }
        hasValidYamlPairs = true;
      }
    }

    if (hasValidYamlPairs) {
      return result;
    }
  }

  // Return as single parameter if all parsing failed
  return { input: trimmedText };
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
  {
    name: 'invoke',
    pattern: /<invoke\s+name="([^"]+)"[^>]*>(.*?)<\/invoke>/gis,
    extractToolId: (match) => match[1],
    extractParams: (match) => match[2],
    extractOriginalText: (match) => match[0],
  },
  {
    name: 'json_function',
    pattern: /```json\s*{\s*"function":\s*"([^"]+)",\s*"parameters":\s*({[^}]*})\s*}\s*```/gis,
    extractToolId: (match) => match[1],
    extractParams: (match) => match[2],
    extractOriginalText: (match) => match[0],
  },
  {
    name: 'tool_block',
    pattern: /\[TOOL:([^\]]+)\](.*?)\[\/TOOL\]/gis,
    extractToolId: (match) => match[1],
    extractParams: (match) => match[2],
    extractOriginalText: (match) => match[0],
  },
];

/**
 * Match tool calling patterns in AI response text
 * Supports various formats: <tool_use>, <function_call>, etc.
 */
export function matchToolCalling(responseText: string): ToolCallingMatch {
  try {
    for (const toolPattern of toolPatterns) {
      // Reset regex lastIndex to ensure proper matching
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
