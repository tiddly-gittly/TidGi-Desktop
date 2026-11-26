import { describe, expect, it } from 'vitest';
import { type IWikiWorkspace, wikiWorkspaceDefaultValues } from '../interface';
import { reconcilePortableIdentities } from '../portableIdentity';

function wiki(id: string, folder = `/wikis/${id}`, fields: Partial<IWikiWorkspace> = {}): IWikiWorkspace {
  return { ...wikiWorkspaceDefaultValues, id, name: id, wikiFolderLocation: folder, homeUrl: `tidgi://${id}`, ...fields };
}

describe('portable workspace identity graph', () => {
  it('remaps a child read before its parent without mutating the input', () => {
    const child = wiki('shared-child', '/wikis/child', { isSubWiki: true, mainWikiID: 'mac-root' });
    const root = wiki('shared-root', '/wikis/root', { groupId: 'local-group', port: 5432, active: true });
    const entries = { 'mac-child': child, 'mac-root': root };
    const result = reconcilePortableIdentities(entries);
    expect(Object.keys(result)).toEqual(['shared-child', 'shared-root']);
    expect(result['shared-child']).toMatchObject({ mainWikiID: 'shared-root', homeUrl: 'tidgi://shared-child', lastUrl: null });
    expect(result['shared-root']).toMatchObject({ groupId: 'local-group', port: 5432, active: true });
    expect(child.mainWikiID).toBe('mac-root');
  });

  it('preserves shared parent references even when only local settings keys differ', () => {
    const result = reconcilePortableIdentities({
      macChild: wiki('child', '/wikis/child', { isSubWiki: true, mainWikiID: 'root' }),
      macRoot: wiki('root'),
    });
    expect(result.child).toMatchObject({ mainWikiID: 'root' });
  });

  it('consolidates the same folder while preserving local presentation and selection', () => {
    const result = reconcilePortableIdentities({
      macRoot: wiki('root', '/wikis/root', { groupId: 'local', order: 7 }),
      root: wiki('root', '/wikis/root', { active: true }),
    });
    expect(Object.keys(result)).toEqual(['root']);
    expect(result.root).toMatchObject({ groupId: 'local', order: 7, active: true });
  });

  it('refuses collisions between different folders without mutating input', () => {
    const entries = { local: wiki('root', '/wikis/one'), root: wiki('root', '/wikis/two') };
    expect(() => reconcilePortableIdentities(entries)).toThrow('Duplicate portable workspace id');
    expect(entries.local.wikiFolderLocation).toBe('/wikis/one');
  });

  it('refuses ambiguous identity swaps and URL delimiters', () => {
    expect(() => reconcilePortableIdentities({ one: wiki('two'), two: wiki('one') })).toThrow('Conflicting');
    expect(() => reconcilePortableIdentities({ one: wiki('bad/id') })).toThrow('Invalid portable workspace id');
  });
});
