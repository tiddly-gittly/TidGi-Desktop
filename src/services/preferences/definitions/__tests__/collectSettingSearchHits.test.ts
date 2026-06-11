import { describe, expect, it } from 'vitest';

import { allWorkspaceSections } from '@services/workspaces/definitions/registry';
import { collectSettingSearchHits } from '../collectSettingSearchHits';
import { allSections } from '../registry';

const identityT = (key: string) => key;

describe('collectSettingSearchHits scope isolation', () => {
  it('finds workspace HTTP API in workspace sections only', () => {
    const workspaceHits = collectSettingSearchHits(allWorkspaceSections, 'http', { t: identityT });
    const preferenceHits = collectSettingSearchHits(allSections, 'http', { t: identityT });

    expect(workspaceHits.some(({ item }) => 'key' in item && item.key === 'enableHTTPAPI')).toBe(true);
    expect(preferenceHits.some(({ item }) => 'key' in item && item.key === 'enableHTTPAPI')).toBe(false);
  });

  it('finds preference MCP port in preference sections only', () => {
    const workspaceHits = collectSettingSearchHits(allWorkspaceSections, 'mcpserverport', { t: identityT });
    const preferenceHits = collectSettingSearchHits(allSections, 'mcpserverport', { t: identityT });

    expect(workspaceHits.some(({ item }) => 'key' in item && item.key === 'mcpServerPort')).toBe(false);
    expect(preferenceHits.some(({ item }) => 'key' in item && item.key === 'mcpServerPort')).toBe(true);
  });

  it('does not mix section registries when both are searched with the same query', () => {
    const workspaceKeys = new Set(
      collectSettingSearchHits(allWorkspaceSections, 'sync', { t: identityT })
        .flatMap(({ item }) => ('key' in item ? [item.key] : [])),
    );
    const preferenceKeys = new Set(
      collectSettingSearchHits(allSections, 'sync', { t: identityT })
        .flatMap(({ item }) => ('key' in item ? [item.key] : [])),
    );

    for (const key of workspaceKeys) {
      expect(preferenceKeys.has(key)).toBe(false);
    }
  });
});
