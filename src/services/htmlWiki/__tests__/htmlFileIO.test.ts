import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readHtmlWikiFile, validateHtmlWikiFile, writeHtmlWikiFile } from '../htmlFileIO';

describe('htmlFileIO', () => {
  let tempDir: string;
  let htmlPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tidgi-html-wiki-'));
    htmlPath = path.join(tempDir, 'wiki.html');
    await fs.writeFile(htmlPath, '<html><body>hello</body></html>', 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('validates and reads html wiki files', async () => {
    await expect(validateHtmlWikiFile(htmlPath)).resolves.toBeUndefined();
    await expect(readHtmlWikiFile(htmlPath)).resolves.toContain('hello');
  });

  it('writes html atomically', async () => {
    await writeHtmlWikiFile(htmlPath, '<html><body>updated</body></html>');
    await expect(readHtmlWikiFile(htmlPath)).resolves.toContain('updated');
  });

  it('rejects non-html extensions', async () => {
    const txtPath = path.join(tempDir, 'notes.txt');
    await fs.writeFile(txtPath, '<html></html>', 'utf-8');
    await expect(validateHtmlWikiFile(txtPath)).rejects.toThrow(/Not a valid HTML wiki file/);
  });
});
