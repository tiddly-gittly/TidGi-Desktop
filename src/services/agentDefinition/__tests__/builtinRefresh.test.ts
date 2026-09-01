import type { HostAgentToolConfig } from 'memeloop';
import { describe, expect, it } from 'vitest';

import { mergeDesktopGeneralAssistantTools, shouldRefreshBuiltinDefinition } from '../index';

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

  it('refreshes an explicitly uncustomized bundled definition', () => {
    expect(shouldRefreshBuiltinDefinition({
      isCustomized: false,
    })).toBe(true);
  });

  it('preserves an explicitly customized bundled definition', () => {
    expect(shouldRefreshBuiltinDefinition({
      isCustomized: true,
    })).toBe(false);
  });
});
