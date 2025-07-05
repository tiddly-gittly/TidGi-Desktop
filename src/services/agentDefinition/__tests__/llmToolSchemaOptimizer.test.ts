import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock i18n before importing the module
vi.mock('@services/libs/i18n', () => ({
  i18n: {
    t: vi.fn(),
  },
}));

// Import after mock
import { i18n } from '@services/libs/i18n';
import { optimizeToolForLLM, optimizeToolSchema } from '../llmToolSchemaOptimizer';

// Get the mocked function
const mockI18nT = vi.mocked(i18n.t);

describe('llmToolSchemaOptimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('optimizeToolSchema', () => {
    it('should optimize and translate schema with noise removal', () => {
      // Mock i18n.t to return translated text for some keys and original for others
      mockI18nT.mockImplementation((...arguments_: unknown[]) => {
        const key = arguments_[0] as string;
        if (key === 'Schema.WikiSearch.WorkspaceNameTitle') return '工作区名';
        if (key === 'Schema.WikiSearch.MaxResultsTitle') return '最大数量';
        if (key === 'Schema.WikiSearch.Description') return '在wiki中搜索内容';
        if (key === 'Schema.WikiSearch.WorkspaceName') return '工作区名描述';
        if (key === 'Schema.WikiSearch.MaxResults') return '最大数量描述';
        if (key === 'Schema.Required') return '必填';
        return key;
      });

      const inputSchema = {
        title: 'Schema.WikiSearch.Title',
        description: 'Schema.WikiSearch.Description',
        type: 'object',
        properties: {
          workspaceName: {
            title: 'Schema.WikiSearch.WorkspaceNameTitle',
            description: 'Schema.WikiSearch.WorkspaceName',
            type: 'string',
          },
          maxResults: {
            title: 'Schema.WikiSearch.MaxResultsTitle',
            description: 'Schema.WikiSearch.MaxResults',
            default: 10,
            type: 'number',
          },
        },
        required: ['workspaceName', 'maxResults'],
        additionalProperties: false,
      };

      const result = optimizeToolSchema(inputSchema);

      expect(result).toEqual({
        description: '在wiki中搜索内容',
        parameters: 'workspaceName（工作区名，必填）: string - 工作区名描述；maxResults（最大数量，默认: 10，必填）: number - 最大数量描述',
      });
    });

    it('should handle empty schema gracefully', () => {
      mockI18nT.mockImplementation((...arguments_: unknown[]) => arguments_[0] as string);

      const inputSchema = {};
      const result = optimizeToolSchema(inputSchema);

      expect(result).toEqual({
        description: '',
        parameters: '',
      });
    });

    it('should remove JSON schema noise and compress text', () => {
      mockI18nT.mockImplementation((...arguments_: unknown[]) => {
        const key = arguments_[0] as string;
        if (key === 'test.key') return 'Schema.TestParameter.Title   with   spaces   ';
        return key;
      });

      const inputSchema = {
        title: 'test.key',
        description: 'test.key',
        type: 'object',
      };

      const result = optimizeToolSchema(inputSchema);

      expect(result.description).toBe('Schema.TestParameter.Title   with   spaces   ');
    });

    it('should handle camelCase conversion', () => {
      mockI18nT.mockImplementation((...arguments_: unknown[]) => {
        const key = arguments_[0] as string;
        if (key === 'camelCaseTest') return 'camelCaseTestValue';
        return key;
      });

      const inputSchema = {
        title: 'camelCaseTest',
        type: 'object',
      };

      const result = optimizeToolSchema(inputSchema);

      expect(result.description).toBe('camelCaseTestValue');
    });

    it('should handle properties without optional fields', () => {
      mockI18nT.mockImplementation((...arguments_: unknown[]) => arguments_[0] as string);

      const inputSchema = {
        type: 'object',
        properties: {
          simpleField: {
            type: 'string',
          },
        },
      };

      const result = optimizeToolSchema(inputSchema);

      expect(result.parameters).toBe('simpleField: string');
    });
  });

  describe('optimizeToolForLLM', () => {
    it('should convert tool with schema to LLM format', () => {
      mockI18nT.mockImplementation((...arguments_: unknown[]) => {
        const key = arguments_[0] as string;
        if (key === 'wiki-search') return '搜索';
        if (key === 'Search wiki content') return '搜索wiki内容';
        if (key === 'Query') return '查询';
        return key;
      });

      const tool = {
        id: 'wiki-search',
        name: 'wiki-search',
        description: 'Search wiki content',
        parameterSchema: {
          title: 'WikiSearch',
          description: 'Search parameters',
          type: 'object',
          properties: {
            query: {
              title: 'Query',
              description: 'Search query',
              type: 'string',
            },
          },
          required: ['query'],
        },
      };

      const result = optimizeToolForLLM(tool);

      expect(result).toEqual({
        id: 'wiki-search',
        name: '搜索',
        description: 'Search parameters',
        schema: {
          description: 'Search parameters',
          parameters: 'query（查询，Schema.Required）: string - Search query',
        },
      });
    });

    it('should handle tool without translations', () => {
      mockI18nT.mockImplementation((...arguments_: unknown[]) => arguments_[0] as string); // No translation available

      const tool = {
        id: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        parameterSchema: {
          type: 'object',
          properties: {},
        },
      };

      const result = optimizeToolForLLM(tool);

      expect(result).toEqual({
        id: 'test-tool',
        name: 'Test Tool',
        description: '',
        schema: {
          description: '',
          parameters: '',
        },
      });
    });
  });
});
