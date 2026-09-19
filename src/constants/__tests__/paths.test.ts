import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getTiddlyWikiBootPath, NSFW_BINARY_PATH, resolveNsfwBinaryPath, TIDDLYWIKI_PACKAGE_FOLDER } from '../paths';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe('nsfw native binary path', () => {
  it('resolves the development binary below the project node_modules folder', () => {
    expect(resolveNsfwBinaryPath('/project/node_modules')).toBe(
      path.resolve('/project/node_modules', 'nsfw', 'build', 'Release', 'nsfw.node'),
    );
  });

  it('resolves the packaged binary below Resources/node_modules', () => {
    expect(resolveNsfwBinaryPath('/Applications/TidGi.app/Contents/Resources/node_modules')).toBe(
      '/Applications/TidGi.app/Contents/Resources/node_modules/nsfw/build/Release/nsfw.node',
    );
  });

  it('rejects an empty package path base instead of producing an empty env value', () => {
    expect(() => resolveNsfwBinaryPath('   ')).toThrow('package path base');
  });

  it('exports the current environment binary path as an absolute path', () => {
    expect(path.isAbsolute(NSFW_BINARY_PATH)).toBe(true);
    expect(NSFW_BINARY_PATH).toMatch(/[\\/]nsfw[\\/]build[\\/]Release[\\/]nsfw\.node$/);
  });
});

describe('TiddlyWiki boot path', () => {
  it('uses the bundled installation in packaged apps even when the wiki has a local copy', () => {
    const wikiPath = mkdtempSync(path.join(tmpdir(), 'tidgi-packaged-wiki-'));
    temporaryDirectories.push(wikiPath);
    mkdirSync(path.join(wikiPath, 'node_modules', 'tiddlywiki', 'boot'), { recursive: true });

    expect(getTiddlyWikiBootPath(wikiPath, true)).toBe(TIDDLYWIKI_PACKAGE_FOLDER);
  });

  it('keeps wiki-local TiddlyWiki overrides available during development', () => {
    const wikiPath = mkdtempSync(path.join(tmpdir(), 'tidgi-development-wiki-'));
    temporaryDirectories.push(wikiPath);
    const localBootPath = path.join(wikiPath, 'node_modules', 'tiddlywiki', 'boot');
    mkdirSync(localBootPath, { recursive: true });

    expect(getTiddlyWikiBootPath(wikiPath, false)).toBe(localBootPath);
  });
});
