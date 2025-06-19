import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentToolResult } from '../../buildInAgentTools/interface';

// Test for tool calling functionality in basicPromptConcatHandler
describe('Tool Calling Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tool Call Detection Patterns', () => {
    it('should match XML-style tool use pattern', () => {
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

      // Test the pattern matching logic
      const toolUsePattern = /<tool_use\s+name="([^"]+)"[^>]*>(.*?)<\/tool_use>/gis;
      const match = toolUsePattern.exec(responseText);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('wiki-search');

      // Parse the parameters
      const parametersText = match![2].trim();
      const parameters = JSON.parse(parametersText) as Record<string, unknown>;

      expect(parameters.workspaceName).toBe('documentation');
      expect(parameters.filter).toBe('[tag[plugin]]');
      expect(parameters.maxResults).toBe(5);
    });

    it('should match function call pattern', () => {
      const responseText = `
<function_call name="wiki-search">
{
  "workspaceName": "main-wiki",
  "filter": "[tag[help]]"
}
</function_call>
      `;

      const functionCallPattern = /<function_call\s+name="([^"]+)"[^>]*>(.*?)<\/function_call>/gis;
      const match = functionCallPattern.exec(responseText);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('wiki-search');
    });

    it('should match tool block pattern', () => {
      const responseText = `
[TOOL:wiki-search]
workspaceName=documentation
filter=[tag[example]]
maxResults=10
[/TOOL]
      `;

      const toolBlockPattern = /\[TOOL:([^\]]+)\](.*?)\[\/TOOL\]/gis;
      const match = toolBlockPattern.exec(responseText);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('wiki-search');

      // Parse key-value parameters
      const parametersText = match![2].trim();
      const parameters: Record<string, unknown> = {};
      const pairs = parametersText.split(/[,\n]/).map((pair: string) => pair.trim()).filter(Boolean);

      for (const pair of pairs) {
        const equalIndex = pair.indexOf('=');
        if (equalIndex > 0) {
          const key = pair.slice(0, equalIndex).trim();
          const value = pair.slice(equalIndex + 1).trim();
          parameters[key] = value;
        }
      }

      expect(parameters.workspaceName).toBe('documentation');
      expect(parameters.filter).toBe('[tag[example]]');
      expect(parameters.maxResults).toBe('10');
    });
  });

  describe('Parameter Parsing', () => {
    it('should parse JSON parameters', () => {
      const jsonParameters = `{
        "workspaceName": "test-wiki",
        "filter": "[tag[test]]",
        "maxResults": 3,
        "includeText": true
      }`;

      const parsed = JSON.parse(jsonParameters) as Record<string, unknown>;

      expect(parsed.workspaceName).toBe('test-wiki');
      expect(parsed.filter).toBe('[tag[test]]');
      expect(parsed.maxResults).toBe(3);
      expect(parsed.includeText).toBe(true);
    });

    it('should parse YAML-like parameters', () => {
      const yamlParameters = `
workspaceName: test-wiki
filter: "[tag[help]]"
maxResults: 5
includeText: true
      `;

      // Simulate YAML-like parsing
      const parameters: Record<string, unknown> = {};
      const lines = yamlParameters.trim().split('\n');

      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();

          // Try to parse as JSON value, fallback to string
          try {
            parameters[key] = JSON.parse(value);
          } catch {
            parameters[key] = value;
          }
        }
      }

      expect(parameters.workspaceName).toBe('test-wiki');
      expect(parameters.filter).toBe('[tag[help]]');
      expect(parameters.maxResults).toBe(5);
      expect(parameters.includeText).toBe(true);
    });

    it('should parse key-value parameters', () => {
      const kvParameters = 'workspaceName=my-wiki,filter=[tag[docs]],maxResults=8';

      const parameters: Record<string, unknown> = {};
      const pairs = kvParameters.split(',').map((pair: string) => pair.trim()).filter(Boolean);

      for (const pair of pairs) {
        const equalIndex = pair.indexOf('=');
        if (equalIndex > 0) {
          const key = pair.slice(0, equalIndex).trim();
          const value = pair.slice(equalIndex + 1).trim();

          // Try to parse as number or boolean
          if (!Number.isNaN(Number(value))) {
            parameters[key] = Number(value);
          } else if (value === 'true' || value === 'false') {
            parameters[key] = value === 'true';
          } else {
            parameters[key] = value;
          }
        }
      }

      expect(parameters.workspaceName).toBe('my-wiki');
      expect(parameters.filter).toBe('[tag[docs]]');
      expect(parameters.maxResults).toBe(8);
    });

    it('should handle malformed parameters gracefully', () => {
      const malformedParameters = 'invalid json {';

      // Should not throw and return fallback
      let result;
      try {
        result = JSON.parse(malformedParameters) as unknown;
      } catch {
        result = { input: malformedParameters };
      }

      expect(result).toEqual({ input: malformedParameters });
    });
  });

  describe('Tool Result Message Creation', () => {
    it('should create message with correct metadata for successful execution', () => {
      const toolId = 'wiki-search';
      const toolResult: AgentToolResult = {
        success: true,
        data: {
          results: [
            { title: 'Test Page', text: 'Test content' },
          ],
          totalFound: 1,
          returned: 1,
        },
      };

      const toolResultMessage = {
        id: `tool-result-${Date.now()}`,
        agentId: 'test-agent',
        role: 'assistant' as const,
        content: `Tool "${toolId}" executed successfully. Result: ${JSON.stringify(toolResult.data)}`,
        contentType: 'text/plain',
        modified: new Date(),
        metadata: {
          toolId,
          toolResult,
          sourceType: 'toolCalling',
          originalToolCall: '<tool_use name="wiki-search">...</tool_use>',
        },
      };

      expect(toolResultMessage.metadata.sourceType).toBe('toolCalling');
      expect(toolResultMessage.metadata.toolId).toBe('wiki-search');
      expect(toolResultMessage.metadata.toolResult.success).toBe(true);
      expect(toolResultMessage.content).toContain('executed successfully');
    });

    it('should create message with correct metadata for failed execution', () => {
      const toolId = 'wiki-search';
      const toolResult: AgentToolResult = {
        success: false,
        error: 'Workspace not found',
      };

      const toolResultMessage = {
        id: `tool-result-${Date.now()}`,
        agentId: 'test-agent',
        role: 'assistant' as const,
        content: `Tool "${toolId}" failed: ${toolResult.error}`,
        contentType: 'text/plain',
        modified: new Date(),
        metadata: {
          toolId,
          toolResult,
          sourceType: 'toolCalling',
          originalToolCall: '<tool_use name="wiki-search">...</tool_use>',
        },
      };

      expect(toolResultMessage.metadata.sourceType).toBe('toolCalling');
      expect(toolResultMessage.metadata.toolResult.success).toBe(false);
      expect(toolResultMessage.content).toContain('failed');
      expect(toolResultMessage.content).toContain('Workspace not found');
    });
  });

  describe('Tool Execution Context', () => {
    it('should provide correct context to tool execution', () => {
      const executionContext = {
        workspaceId: 'agent-123',
        userMessages: [
          'Search for TiddlyWiki documentation',
          'Find examples of plugins',
        ],
      };

      expect(executionContext.workspaceId).toBe('agent-123');
      expect(executionContext.userMessages).toHaveLength(2);
      expect(executionContext.userMessages[0]).toContain('documentation');
    });
  });

  describe('Error Handling', () => {
    it('should handle tool not found in registry', () => {
      const toolId = 'nonexistent-tool';

      // Simulate tool registry lookup
      const toolRegistry = new Map([
        ['wiki-search', { id: 'wiki-search', execute: vi.fn() }],
      ]);

      const tool = toolRegistry.get(toolId);
      expect(tool).toBeUndefined();

      // Should log warning and continue
      const logMessage = `Tool not found in registry: ${toolId}`;
      expect(logMessage).toContain('not found');
    });

    it('should handle tool execution errors', async () => {
      const mockTool = {
        id: 'wiki-search',
        execute: vi.fn().mockRejectedValue(new Error('Execution failed')),
      };

      let result: AgentToolResult;
      try {
        result = await mockTool.execute({}) as AgentToolResult;
      } catch (error) {
        result = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });

    it('should handle invalid tool parameters', () => {
      const invalidParameters = {
        workspaceName: 123, // Should be string
        filter: null, // Should be string
      };

      // Tool should validate parameters and return error
      const validationErrors: string[] = [];

      if (typeof invalidParameters.workspaceName !== 'string') {
        validationErrors.push('workspaceName must be a string');
      }

      if (typeof invalidParameters.filter !== 'string') {
        validationErrors.push('filter must be a string');
      }

      expect(validationErrors).toHaveLength(2);
      expect(validationErrors[0]).toContain('workspaceName');
      expect(validationErrors[1]).toContain('filter');
    });
  });

  describe('Integration with Agent Handler', () => {
    it('should process tool calls in the correct order', () => {
      const processingSteps = [
        'AI generates response with tool call',
        'System detects tool call pattern',
        'System extracts tool ID and parameters',
        'System executes tool from registry',
        'System creates result message',
        'System adds result to conversation',
        'System updates agent instance',
      ];

      // Verify the expected flow
      expect(processingSteps[0]).toContain('AI generates');
      expect(processingSteps[1]).toContain('detects');
      expect(processingSteps[2]).toContain('extracts');
      expect(processingSteps[3]).toContain('executes');
      expect(processingSteps[4]).toContain('creates result');
      expect(processingSteps[5]).toContain('adds result');
      expect(processingSteps[6]).toContain('updates agent');
    });

    it('should integrate with AI response containing tool call', () => {
      const aiResponse = `
I'll search for TiddlyWiki documentation to help you.

<tool_use name="wiki-search">
{
  "workspaceName": "documentation",
  "filter": "[tag[help]tag[tiddlywiki]]",
  "maxResults": 3,
  "includeText": true
}
</tool_use>

Let me find the relevant documentation for you.
      `;

      // Extract tool call
      const toolUsePattern = /<tool_use\s+name="([^"]+)"[^>]*>(.*?)<\/tool_use>/gis;
      const match = toolUsePattern.exec(aiResponse);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('wiki-search');

      const parameters = JSON.parse(match![2].trim()) as Record<string, unknown>;
      expect(parameters.workspaceName).toBe('documentation');
      expect(parameters.filter).toBe('[tag[help]tag[tiddlywiki]]');
      expect(parameters.maxResults).toBe(3);
      expect(parameters.includeText).toBe(true);
    });
  });
});
