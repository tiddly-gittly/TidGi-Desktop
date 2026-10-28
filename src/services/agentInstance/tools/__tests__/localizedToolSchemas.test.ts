import { i18n } from '@services/libs/i18n';
import { createInstance } from 'i18next';
import { type InjectToolListOptions, schemaToToolContent } from 'memeloop';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import english from '../../../../../localization/locales/en/agent.json';
import chinese from '../../../../../localization/locales/zh-Hans/agent.json';
import { desktopBuiltinToolDefinitions } from '../builtinToolDefinitions';
import { defineDesktopTool } from '../defineToolDefinition';
import { createNativeModelToolDefinitions } from '../nativeModelTools';
import { wikiSearchDefinition } from '../wikiSearch';

const translations = createInstance();

beforeAll(async () => {
  await translations.init({
    lng: 'en',
    defaultNS: 'agent',
    resources: { en: { agent: english }, 'zh-Hans': { agent: chinese } },
    interpolation: { escapeValue: false },
  });
  vi.spyOn(i18n, 't').mockImplementation(translations.t.bind(translations));
});

describe('Desktop tool request localization', () => {
  it.each(['en', 'zh-Hans'])('projects readable metadata for every builtin tool (%s)', async language => {
    await translations.changeLanguage(language);
    for (const definition of desktopBuiltinToolDefinitions) {
      const projected = createNativeModelToolDefinitions(definition.llmToolSchemas ?? {});
      expect(JSON.stringify(projected), definition.toolId).not.toMatch(/\bSchema\.[A-Za-z]/u);
    }
  });

  it('translates builtin prompt and native schemas at request time, including after a language change', async () => {
    for (const [language, resources] of [['en', english], ['zh-Hans', chinese], ['en', english]] as const) {
      await translations.changeLanguage(language);
      const injectToolList = vi.fn<(options: InjectToolListOptions) => void>();
      const registerModelTool = vi.fn();
      await wikiSearchDefinition.onProcessPrompts?.({
        config: { sourceType: 'wiki', toolListPosition: { targetId: 'tools', position: 'after' } },
        toolConfig: { id: 'wiki-search' },
        injectToolList,
        registerModelTool,
      } as never);
      const nativeSchema = registerModelTool.mock.calls[0][0].inputSchema as Record<string, unknown>;
      const promptSchemas = injectToolList.mock.calls[0][0].toolSchemas;
      expect(promptSchemas).toBeDefined();
      const promptText = promptSchemas!.map(schema => schemaToToolContent(schema)).join('\n');
      expect(nativeSchema).toMatchObject({
        description: resources.Schema.WikiSearch.Tool.Description,
        properties: {
          workspaceName: {
            title: resources.Schema.WikiSearch.Tool.Parameters.workspaceName.Title,
            description: resources.Schema.WikiSearch.Tool.Parameters.workspaceName.Description,
          },
        },
      });
      expect(promptText).toContain(resources.Schema.WikiSearch.Tool.Description);
      expect(promptText).toContain(resources.Schema.WikiSearch.Tool.Parameters.workspaceName.Description);
      expect(JSON.stringify(nativeSchema)).not.toContain('Schema.WikiSearch.');
      expect(promptText).not.toContain('Schema.WikiSearch.');
    }
    expect(wikiSearchDefinition.llmToolSchemas?.['wiki-search'].meta()?.description).toBe('Schema.WikiSearch.Tool.Description');
  });

  it('preserves names, enum values, examples, defaults and validation while translating nested metadata', async () => {
    await translations.changeLanguage('zh-Hans');
    const key = 'Schema.WikiSearch.Tool.Description';
    const schema = z.object({
      title: z.literal(key).default(key).meta({ description: key }),
      nested: z.array(z.object({ value: z.string().meta({ title: key }) })).meta({
        examples: [{ title: key, description: key }],
      }),
      union: z.union([z.string().meta({ description: key }), z.number()]),
    }).meta({ title: 'unchanged-tool-name', description: key });
    const inputSchema = createNativeModelToolDefinitions({ 'unchanged-tool-name': schema })[0].inputSchema;
    expect(inputSchema).toMatchObject({
      title: 'unchanged-tool-name',
      description: chinese.Schema.WikiSearch.Tool.Description,
      properties: {
        title: { const: key, default: key, description: chinese.Schema.WikiSearch.Tool.Description },
        nested: {
          examples: [{ title: key, description: key }],
          items: { properties: { value: { title: chinese.Schema.WikiSearch.Tool.Description } } },
        },
        union: { anyOf: [{ type: 'string', description: chinese.Schema.WikiSearch.Tool.Description }, { type: 'number' }] },
      },
    });
    expect(schema.parse({ nested: [], union: 4 })).toEqual({ title: key, nested: [], union: 4 });
    expect(() => schema.parse({ title: 'different', nested: [], union: 4 })).toThrow();
  });

  it('localizes explicit prompt schema overrides without replacing their schema set', async () => {
    await translations.changeLanguage('en');
    const schema = z.object({}).meta({ title: 'explicit-tool', description: 'Schema.WikiSearch.Tool.Description' });
    const definition = defineDesktopTool({
      toolId: 'explicit',
      displayName: 'explicit',
      description: '',
      configSchema: z.object({}),
      llmToolSchemas: { omitted: z.object({}) },
      onProcessPrompts: ({ injectToolList }) => {
        injectToolList({ targetId: 'tools', position: 'child', toolSchemas: [schema] });
      },
    });
    const injectToolList = vi.fn<(options: InjectToolListOptions) => void>();
    await definition.onProcessPrompts?.({ injectToolList } as never);
    const projected = injectToolList.mock.calls[0][0].toolSchemas!;
    expect(projected).toHaveLength(1);
    expect(schemaToToolContent(projected[0])).toContain(english.Schema.WikiSearch.Tool.Description);
    expect(schemaToToolContent(projected[0])).toContain('explicit-tool');
  });
});
