import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the logger to prevent Electron app dependency issues
vi.mock('@services/libs/log', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

import { addToolPattern, getToolPatterns, matchToolCalling } from '../responsePatternUtility';

describe('responsePatternUtility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('matchToolCalling', () => {
    describe('XML-style patterns', () => {
      it('should match tool_use pattern with JSON parameters', () => {
        const responseText = `
I'll search for documentation about TiddlyWiki plugins.

<tool_use name="wiki-search">
{
  "workspaceName": "documentation",
  "filter": "[tag[plugin]]",
  "maxResults": 5
}
</tool_use>

Let me find the relevant information for you.
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.toolId).toBe('wiki-search');
        expect(result.parameters).toEqual({
          workspaceName: 'documentation',
          filter: '[tag[plugin]]',
          maxResults: 5,
        });
        expect(result.originalText).toContain('<tool_use name="wiki-search">');
      });

      it('should match function_call pattern', () => {
        const responseText = `
<function_call name="web-search">
{
  "query": "TiddlyWiki plugins tutorial",
  "maxResults": 10
}
</function_call>
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.toolId).toBe('web-search');
        expect(result.parameters).toEqual({
          query: 'TiddlyWiki plugins tutorial',
          maxResults: 10,
        });
      });

      it('should match invoke pattern', () => {
        const responseText = `
<invoke name="file-read">
{
  "filePath": "/path/to/file.txt",
  "encoding": "utf8"
}
</invoke>
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.toolId).toBe('file-read');
        expect(result.parameters).toEqual({
          filePath: '/path/to/file.txt',
          encoding: 'utf8',
        });
      });
    });

    describe('JSON function pattern', () => {
      it('should match JSON function block', () => {
        const responseText = `
\`\`\`json
{
  "function": "calculate",
  "parameters": {
    "operation": "add",
    "numbers": [1, 2, 3]
  }
}
\`\`\`
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.toolId).toBe('calculate');
        expect(result.parameters).toEqual({
          operation: 'add',
          numbers: [1, 2, 3],
        });
      });
    });

    describe('Tool block pattern', () => {
      it('should match tool block with key-value parameters', () => {
        const responseText = `
[TOOL:wiki-search]
workspaceName=documentation
filter=[tag[example]]
maxResults=10
[/TOOL]
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.toolId).toBe('wiki-search');
        expect(result.parameters).toEqual({
          workspaceName: 'documentation',
          filter: '[tag[example]]',
          maxResults: 10, // Numbers are parsed as numbers, not strings
        });
      });

      it('should match tool block with YAML-like parameters', () => {
        const responseText = `
[TOOL:file-write]
path: /tmp/test.txt
content: "Hello World"
append: true
[/TOOL]
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.toolId).toBe('file-write');
        expect(result.parameters).toEqual({
          path: '/tmp/test.txt',
          content: 'Hello World',
          append: true,
        });
      });
    });

    describe('Parameter parsing', () => {
      it('should parse JSON parameters correctly', () => {
        const responseText = `
<tool_use name="test-tool">
{
  "stringValue": "hello",
  "numberValue": 42,
  "booleanValue": true,
  "arrayValue": [1, 2, 3],
  "objectValue": {"nested": "value"}
}
</tool_use>
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.parameters).toEqual({
          stringValue: 'hello',
          numberValue: 42,
          booleanValue: true,
          arrayValue: [1, 2, 3],
          objectValue: { nested: 'value' },
        });
      });

      it('should parse YAML-like parameters', () => {
        const responseText = `
<tool_use name="yaml-tool">
name: test
count: 5
enabled: true
items: ["a", "b", "c"]
</tool_use>
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.parameters).toEqual({
          name: 'test',
          count: 5,
          enabled: true,
          items: ['a', 'b', 'c'],
        });
      });

      it('should parse key-value parameters with mixed formats', () => {
        const responseText = `
<tool_use name="mixed-tool">
simpleKey=simpleValue
numberKey=123
booleanKey=false
</tool_use>
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.parameters).toEqual({
          simpleKey: 'simpleValue',
          numberKey: 123,
          booleanKey: false,
        });
      });

      it('should parse key-value parameters with JSON objects on separate lines', () => {
        const responseText = `
<tool_use name="json-tool">
simpleKey=simpleValue
jsonKey={"complex": "object"}
</tool_use>
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.parameters).toEqual({
          simpleKey: 'simpleValue',
          jsonKey: { complex: 'object' },
        });
      });

      it('should handle empty parameters', () => {
        const responseText = `
<tool_use name="no-params">
</tool_use>
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.toolId).toBe('no-params');
        expect(result.parameters).toEqual({});
      });

      it('should handle malformed parameters gracefully', () => {
        const responseText = `
<tool_use name="malformed-tool">
This is not valid JSON or key-value pairs
Just some random text
</tool_use>
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.toolId).toBe('malformed-tool');
        expect(result.parameters).toEqual({
          input: 'This is not valid JSON or key-value pairs\nJust some random text',
        });
      });
    });

    describe('Pattern matching priority', () => {
      it('should match the first valid pattern found', () => {
        const responseText = `
<tool_use name="first-tool">
{"param": "value1"}
</tool_use>

<function_call name="second-tool">
{"param": "value2"}
</function_call>
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.toolId).toBe('first-tool');
        expect(result.parameters).toEqual({ param: 'value1' });
      });
    });

    describe('No match scenarios', () => {
      it('should return not found for text without tool patterns', () => {
        const responseText = 'This is just regular text without any tool calling patterns.';

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(false);
        expect(result.toolId).toBeUndefined();
        expect(result.parameters).toBeUndefined();
        expect(result.originalText).toBeUndefined();
      });

      it('should return not found for malformed tool patterns', () => {
        const responseText = '<tool_use name="incomplete">no closing tag';

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should handle case-insensitive pattern matching', () => {
        const responseText = `
<TOOL_USE name="uppercase-tool">
{"test": "value"}
</TOOL_USE>
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.toolId).toBe('uppercase-tool');
      });

      it('should handle extra attributes in XML tags', () => {
        const responseText = `
<tool_use name="test-tool" version="1.0" type="search">
{"query": "test"}
</tool_use>
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.toolId).toBe('test-tool');
        expect(result.parameters).toEqual({ query: 'test' });
      });

      it('should handle multiline parameters correctly', () => {
        const responseText = `
<tool_use name="multiline-tool">
{
  "longText": "This is a very long text that spans multiple lines and contains various characters like quotes ' and special symbols @#$%",
  "array": [
    "item1",
    "item2",
    "item3"
  ]
}
</tool_use>
        `;

        const result = matchToolCalling(responseText);

        expect(result.found).toBe(true);
        expect(result.parameters?.longText).toContain('spans multiple lines');
        expect(result.parameters?.array).toEqual(['item1', 'item2', 'item3']);
      });
    });
  });

  describe('getToolPatterns', () => {
    it('should return all supported tool patterns', () => {
      const patterns = getToolPatterns();

      expect(patterns).toHaveLength(5);
      expect(patterns.map(p => p.name)).toEqual([
        'tool_use',
        'function_call',
        'invoke',
        'json_function',
        'tool_block',
      ]);
    });

    it('should return patterns with required properties', () => {
      const patterns = getToolPatterns();

      patterns.forEach(pattern => {
        expect(pattern).toHaveProperty('name');
        expect(pattern).toHaveProperty('pattern');
        expect(pattern).toHaveProperty('extractToolId');
        expect(pattern).toHaveProperty('extractParams');
        expect(pattern).toHaveProperty('extractOriginalText');
        expect(typeof pattern.extractToolId).toBe('function');
        expect(typeof pattern.extractParams).toBe('function');
        expect(typeof pattern.extractOriginalText).toBe('function');
      });
    });
  });

  describe('addToolPattern', () => {
    it('should add a new tool pattern', () => {
      const originalLength = getToolPatterns().length;

      const customPattern = {
        name: 'custom_pattern',
        pattern: /<custom\s+name="([^"]+)"[^>]*>(.*?)<\/custom>/gis,
        extractToolId: (match: RegExpExecArray) => match[1],
        extractParams: (match: RegExpExecArray) => match[2],
        extractOriginalText: (match: RegExpExecArray) => match[0],
      };

      addToolPattern(customPattern);

      const patterns = getToolPatterns();
      expect(patterns).toHaveLength(originalLength + 1);
      expect(patterns[patterns.length - 1].name).toBe('custom_pattern');
    });

    it('should make new patterns available for matching', () => {
      const customPattern = {
        name: 'test_custom',
        pattern: /<test_custom\s+tool="([^"]+)"[^>]*>(.*?)<\/test_custom>/gis,
        extractToolId: (match: RegExpExecArray) => match[1],
        extractParams: (match: RegExpExecArray) => match[2],
        extractOriginalText: (match: RegExpExecArray) => match[0],
      };

      addToolPattern(customPattern);

      const responseText = `
<test_custom tool="my-tool">
{"param": "value"}
</test_custom>
      `;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.toolId).toBe('my-tool');
      expect(result.parameters).toEqual({ param: 'value' });
    });
  });

  describe('Error handling', () => {
    it('should handle regex errors gracefully', () => {
      // Create a pattern that might cause regex issues
      const responseText = 'Some text with [TOOL:broken-pattern]invalid regex content[/TOOL]';

      const result = matchToolCalling(responseText);

      // Should not throw and should handle gracefully
      expect(result).toBeDefined();
      expect(result.found).toBe(true); // This pattern should still match
    });

    it('should handle large input text efficiently', () => {
      // Create a large text with tool pattern at the end
      const largePrefix = 'x'.repeat(10000);
      const responseText = `${largePrefix}
<tool_use name="test-tool">
{"test": "value"}
</tool_use>`;

      const result = matchToolCalling(responseText);

      expect(result.found).toBe(true);
      expect(result.toolId).toBe('test-tool');
    });
  });
});
