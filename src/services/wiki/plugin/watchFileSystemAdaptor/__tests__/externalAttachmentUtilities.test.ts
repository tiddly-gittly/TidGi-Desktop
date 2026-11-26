import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IFileInfo } from 'tiddlywiki';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWikiRootFromTiddlerPath, moveExternalAttachmentIfNeeded } from '../externalAttachmentUtilities';

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'tidgi-external-attachment-'));
  temporaryDirectories.push(directory);
  return directory;
}

function configureWikiPaths(wikiPath: string, wikiTiddlersPath: string): void {
  // @ts-expect-error - Unit tests only require the TiddlyWiki globals used by this module.
  global.$tw = {
    boot: { files: {}, wikiPath, wikiTiddlersPath },
    utils: {
      Logger: vi.fn(function() {
        return { alert: vi.fn(), log: vi.fn() };
      }),
      createDirectory: (directory: string) => fs.mkdirSync(directory, { recursive: true }),
    },
    wiki: {
      getTiddlerText: vi.fn(() => 'files'),
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('external attachment workspace roots', () => {
  it('uses the main wiki root when simplified storage is the workspace root', () => {
    const wikiRoot = createTemporaryDirectory();
    const tiddlerDirectory = path.join(wikiRoot, 'nested');
    fs.mkdirSync(tiddlerDirectory);
    configureWikiPaths(wikiRoot, wikiRoot);

    expect(getWikiRootFromTiddlerPath(tiddlerDirectory, [])).toBe(fs.realpathSync(wikiRoot));
  });

  it('prefers a nested configured sub-wiki over its simplified main wiki', () => {
    const wikiRoot = createTemporaryDirectory();
    const subWikiRoot = path.join(wikiRoot, 'sub-wiki');
    const subWikiTiddlerDirectory = path.join(subWikiRoot, 'nested');
    fs.mkdirSync(subWikiTiddlerDirectory, { recursive: true });
    configureWikiPaths(wikiRoot, wikiRoot);

    expect(getWikiRootFromTiddlerPath(subWikiTiddlerDirectory, [
      { wikiFolderLocation: subWikiRoot },
    ] as never)).toBe(fs.realpathSync(subWikiRoot));
  });

  it('moves a simplified main wiki attachment to a routed sub-wiki', async () => {
    const wikiRoot = createTemporaryDirectory();
    const subWikiRoot = createTemporaryDirectory();
    const attachmentName = 'diagram.png';
    const sourceAttachment = path.join(wikiRoot, 'files', attachmentName);
    fs.mkdirSync(path.dirname(sourceAttachment), { recursive: true });
    fs.writeFileSync(sourceAttachment, 'fixture');
    configureWikiPaths(wikiRoot, wikiRoot);

    await moveExternalAttachmentIfNeeded(
      `files/${attachmentName}`,
      { filepath: path.join(wikiRoot, 'note.tid') } as IFileInfo,
      { filepath: path.join(subWikiRoot, 'note.tid') } as IFileInfo,
      [{ wikiFolderLocation: subWikiRoot }] as never,
    );

    expect(fs.existsSync(sourceAttachment)).toBe(false);
    expect(fs.readFileSync(path.join(subWikiRoot, 'files', attachmentName), 'utf8')).toBe('fixture');
  });
});
