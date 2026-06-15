import { describe, expect, it } from 'vitest';

import { filterWorkspaceSectionForType, getWorkspaceSectionsForType } from '../definitions/registry';
import { serverSection } from '../definitions/server';
import { subWikiSection } from '../definitions/subWiki';
import { WorkspaceType } from '../workspaceType';

describe('workspace registry filtering', () => {
  it('hides subWiki section for html workspaces', () => {
    const filtered = filterWorkspaceSectionForType(subWikiSection, WorkspaceType.html);
    expect(filtered.items).toHaveLength(0);
  });

  it('hides folder-only server items for html workspaces', () => {
    const filtered = filterWorkspaceSectionForType(serverSection, WorkspaceType.html);
    const componentIds = filtered.items
      .filter((item) => item.type === 'custom' && 'componentId' in item)
      .map((item) => (item as { componentId: string }).componentId);
    expect(componentIds).not.toContain('workspace.server.lastNodeJSArgv');
    expect(componentIds).not.toContain('workspace.server.rootTiddler');
    expect(componentIds).toContain('workspace.server.port');
  });

  it('getWorkspaceSectionsForType excludes search for html', () => {
    const sections = getWorkspaceSectionsForType(WorkspaceType.html);
    expect(sections.map((s) => s.id)).not.toContain('subWiki');
    expect(sections.map((s) => s.id)).not.toContain('search');
    expect(sections.map((s) => s.id)).toContain('appearance');
    expect(sections.map((s) => s.id)).toContain('server');
  });
});
