import { describe, expect, it } from 'vitest';
import { findRendererNodeI18nImports, maskNonCode, scan } from '../verifyNoLegacyWorkspaceCompat.mjs';

describe('verifyNoLegacyWorkspaceCompat scanner', () => {
  it('reports comment-only catch blocks, including parameterized async rejection handlers', () => {
    const source = [
      'try { work(); } catch (error) { /* preserve the boundary */ }',
      'Promise.resolve().catch(async error => {',
      '  // intentionally empty',
      '});',
      'Promise.resolve().catch(() => { report(error); });',
    ].join('\n');

    const matches = scan(source, 'fixture.ts').filter(({ code }) => code === 'silent_empty_catch');
    expect(matches).toHaveLength(2);
    expect(matches.map(({ line }) => line)).toEqual([1, 2]);
  });

  it('reports every unsafe assertion occurrence with source locations', () => {
    const source = [
      'const first = value as unknown as First;',
      'const second = value as never;',
      'const third = value as any;',
      'const fourth = value as unknown as Fourth;',
    ].join('\n');

    expect(scan(source, 'fixture.ts')).toMatchObject([
      { code: 'unsafe_double_assertion', line: 1 },
      { code: 'unsafe_never_assertion', line: 2 },
      { code: 'unsafe_any_assertion', line: 3 },
      { code: 'unsafe_double_assertion', line: 4 },
    ]);
  });

  it('reports legacy workspace fields and aliases', () => {
    const source = [
      'const oldTag = legacyTagName;',
      'const configTag = workspaceConfig.tagName;',
      'const oldFolder = path.basename(effectiveWorkspace.wikiFolderLocation);',
      'const repairedID = workspace.id || storedID;',
      'const parent = workspace.mainWikiToLink;',
      'const oldIdentity = remoteWorkspaceId;',
    ].join('\n');

    expect(scan(source, 'fixture.ts').map(({ code }) => code)).toEqual([
      'workspace_legacy_tag_name',
      'workspace_legacy_tag_name',
      'workspace_name_folder_fallback',
      'workspace_storage_key_identity_fallback',
      'workspace_main_path_identity_fallback',
      'workspace_remote_identity_alias',
    ]);
  });

  it('ignores strings and comments but keeps template expressions executable', () => {
    const source = [
      '// remoteWorkspaceId before 0.8.0 and legacyTagName',
      'const quoted = "remoteWorkspaceId legacyTagName before 0.8.0";',
      'const templateText = `workspaceConfig.tagName remoteWorkspaceId`;',
      'const actual = `${remoteWorkspaceId}`;',
    ].join('\n');

    const masked = maskNonCode(source);
    expect(masked).not.toContain('remoteWorkspaceId legacyTagName');
    const matches = scan(source, 'fixture.ts');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ code: 'workspace_remote_identity_alias', line: 4 });
  });

  it('rejects the main-process i18n entry while allowing renderer-safe subpaths', () => {
    const source = [
      "import { i18n } from '@services/libs/i18n';",
      "import { initRendererI18N } from '@services/libs/i18n/renderer';",
      "import { t } from '@services/libs/i18n/placeholder';",
    ].join('\n');

    expect(findRendererNodeI18nImports(source, 'fixture.tsx')).toHaveLength(1);
  });
});
