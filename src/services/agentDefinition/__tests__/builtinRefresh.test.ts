import type { HostAgentToolConfig } from 'memeloop';
import { describe, expect, it } from 'vitest';

import { mergeDesktopGeneralAssistantTools, resolveAgentToolsOverride, shouldRefreshBuiltinDefinition } from '../index';

function legacyEntity(created: string, updated: string) {
  return {
    builtinVersion: undefined,
    isCustomized: undefined,
    createdAt: new Date(created),
    updatedAt: new Date(updated),
  };
}

describe('bundled Agent definition refresh', () => {
  it('adds missing Desktop tools without replacing a configured tool', () => {
    const configuredWikiSearch = {
      toolId: 'wikiSearch',
      parameters: { wikiSearchParam: { sourceType: 'custom-wiki' } },
    } as HostAgentToolConfig;
    const result = mergeDesktopGeneralAssistantTools(
      [configuredWikiSearch],
      [
        { toolId: 'workspacesList' },
        { toolId: 'wikiSearch', parameters: { wikiSearchParam: { sourceType: 'desktop-wiki' } } },
        { toolId: 'wikiOperation' },
      ] as HostAgentToolConfig[],
    );

    expect(result.map(tool => tool.toolId)).toEqual(['workspacesList', 'wikiSearch', 'wikiOperation']);
    expect(result[1]).toBe(configuredWikiSearch);
  });

  it('treats an empty tool override as explicit instead of falling back to bundled tools', () => {
    const bundled = [{ toolId: 'wikiSearch' }] as HostAgentToolConfig[];
    const customized = [{ toolId: 'customTool', enabled: false }] as HostAgentToolConfig[];

    expect(resolveAgentToolsOverride(undefined, bundled)).toBe(bundled);
    expect(resolveAgentToolsOverride(null, bundled)).toBe(bundled);
    expect(resolveAgentToolsOverride([], bundled)).toEqual([]);
    expect(resolveAgentToolsOverride(customized, bundled)).toBe(customized);
  });

  it('refreshes an explicitly uncustomized bundled definition', () => {
    expect(shouldRefreshBuiltinDefinition({
      ...legacyEntity('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
      builtinVersion: '1.0.0',
      isCustomized: false,
    })).toBe(true);
  });

  it('preserves an explicitly customized bundled definition', () => {
    expect(shouldRefreshBuiltinDefinition({
      ...legacyEntity('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
      builtinVersion: '1.0.0',
      isCustomized: true,
    })).toBe(false);
  });

  it('refreshes unchanged legacy rows and preserves edited legacy rows', () => {
    expect(shouldRefreshBuiltinDefinition(
      legacyEntity('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    )).toBe(true);
    expect(shouldRefreshBuiltinDefinition(
      legacyEntity('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
    )).toBe(false);
  });
});
