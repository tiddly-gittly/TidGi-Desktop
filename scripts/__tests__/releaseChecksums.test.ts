import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { generateReleaseChecksums } from '../releaseChecksums';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => rm(directory, { force: true, recursive: true })));
});

describe('generateReleaseChecksums', () => {
  it('writes deterministic checksums for the required Linux release artifacts', async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), 'tidgi-release-checksums-'));
    temporaryDirectories.push(rootDirectory);
    const nestedDirectory = path.join(rootDirectory, 'nested');
    const outputPath = path.join(rootDirectory, 'SHA256SUMS-linux-x64.txt');
    await mkdir(nestedDirectory);
    await writeFile(path.join(rootDirectory, 'tidgi.rpm'), 'rpm');
    await writeFile(path.join(nestedDirectory, 'tidgi.deb'), 'deb');
    await writeFile(path.join(rootDirectory, 'ignored.zip'), 'zip');

    const checksumLines = await generateReleaseChecksums(rootDirectory, 'linux', 'x64', outputPath);

    expect(checksumLines).toEqual([
      '9cfa1468c93fc18652e34a000f0c6614b0fa18f6f4887477ad9b0d36ca6a7eaa  tidgi.deb',
      '9e7ab438597fee20e16e8e441bed0ce966bd59e0fb993fa7c94be31fb1384d88  tidgi.rpm',
    ]);
    await expect(readFile(outputPath, 'utf8')).resolves.toBe(`${checksumLines.join('\n')}\n`);
  });

  it('rejects an incomplete platform artifact set', async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), 'tidgi-release-checksums-'));
    temporaryDirectories.push(rootDirectory);
    await writeFile(path.join(rootDirectory, 'tidgi.deb'), 'deb');

    await expect(generateReleaseChecksums(rootDirectory, 'linux', 'arm64', path.join(rootDirectory, 'checksums.txt')))
      .rejects.toThrow('Missing linux/arm64 release artifact with .rpm extension');
  });
});
