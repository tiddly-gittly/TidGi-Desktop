/**
 * Tests for schemaToToolContent utility
 */
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';

import { schemaToToolContent } from '../schemaToToolContent';

// Mock i18n
vi.mock('@services/libs/i18n', () => ({
  i18n: {
    t: vi.fn((key: string) => {
      const translations: Record<string, string> = {
        'Tool.Schema.Required': '必需',
        'Tool.Schema.Optional': '可选',
        'Tool.Schema.Description': '描述',
        'Tool.Schema.Parameters': '参数',
        'Tool.Schema.Examples': '使用示例',
      };
      return translations[key] || key;
    }),
  },
}));

describe('schemaToToolContent', () => {
  it('should generate tool content from schema with title and description', () => {
    const testSchema = z.object({
      name: z.string().describe('The name parameter'),
      age: z.number().optional().describe('The age parameter'),
    }).meta({
      title: 'test-tool',
      description: 'A test tool for demonstration',
      examples: [
        { name: 'John', age: 25 },
        { name: 'Jane' },
      ],
    });

    const result = schemaToToolContent(testSchema);

    expect(result).toContain('## test-tool');
    expect(result).toContain('**描述**: A test tool for demonstration');
    expect(result).toContain('- name (string, 必需): The name parameter');
    expect(result).toContain('- age (number, 可选): The age parameter');
    expect(result).toContain('<tool_use name="test-tool">{"name":"John","age":25}</tool_use>');
    expect(result).toContain('<tool_use name="test-tool">{"name":"Jane"}</tool_use>');
  });

  it('should handle schema without description', () => {
    const testSchema = z.object({
      query: z.string().describe('Search query'),
    }).meta({
      title: 'search-tool',
      examples: [{ query: 'test search' }],
    });

    const result = schemaToToolContent(testSchema);

    expect(result).toContain('## search-tool');
    expect(result).toContain('**描述**: search-tool'); // fallback to title
    expect(result).toContain('- query (string, 必需): Search query');
  });

  it('should handle schema without examples', () => {
    const testSchema = z.object({
      input: z.string().describe('Input text'),
    }).meta({
      title: 'input-tool',
      description: 'Processes input text',
    });

    const result = schemaToToolContent(testSchema);

    expect(result).toContain('## input-tool');
    expect(result).toContain('**描述**: Processes input text');
    expect(result).toContain('- input (string, 必需): Input text');
    expect(result).toContain('**使用示例**:\n'); // empty examples section
  });

  it('should handle schema without meta', () => {
    const testSchema = z.object({
      value: z.string().describe('A value'),
    });

    const result = schemaToToolContent(testSchema);

    expect(result).toContain('## tool'); // default title
    expect(result).toContain('- value (string, 必需): A value');
  });

  it('should handle different parameter types', () => {
    const testSchema = z.object({
      text: z.string().describe('Text input'),
      number: z.number().describe('Number input'),
      boolean: z.boolean().describe('Boolean input'),
      array: z.array(z.string()).describe('Array input'),
      object: z.object({ nested: z.string() }).describe('Object input'),
    }).meta({
      title: 'types-tool',
      description: 'Tool demonstrating different types',
    });

    const result = schemaToToolContent(testSchema);

    expect(result).toContain('- text (string, 必需): Text input');
    expect(result).toContain('- number (number, 必需): Number input');
    expect(result).toContain('- boolean (boolean, 必需): Boolean input');
    expect(result).toContain('- array (array, 必需): Array input');
    expect(result).toContain('- object (object, 必需): Object input');
  });

  it('should handle enum parameters with options', () => {
    const testSchema = z.object({
      operation: z.enum(['add', 'delete', 'update']).describe('Type of operation to execute'),
      status: z.enum(['active', 'inactive']).describe('Current status'),
    }).meta({
      title: 'enum-tool',
      description: 'Tool demonstrating enum parameters',
    });

    const result = schemaToToolContent(testSchema);

    expect(result).toContain('- operation (enum, 必需): Type of operation to execute ("add", "delete", "update")');
    expect(result).toContain('- status (enum, 必需): Current status ("active", "inactive")');
  });
});
