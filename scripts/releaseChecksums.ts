import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ReleasePlatform = 'linux' | 'mac' | 'win';

const requiredExtensions: Record<ReleasePlatform, readonly string[]> = {
  linux: ['.deb', '.rpm'],
  mac: ['.zip'],
  win: ['.exe', '.msix'],
};

async function findFiles(rootDirectory: string): Promise<string[]> {
  const entries = await readdir(rootDirectory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(rootDirectory, entry.name);
    return entry.isDirectory() ? findFiles(entryPath) : [entryPath];
  }));
  return nestedFiles.flat();
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return hash.digest('hex');
}

function compareArtifactPaths(left: string, right: string): number {
  const leftBasename = path.basename(left);
  const rightBasename = path.basename(right);
  if (leftBasename < rightBasename) return -1;
  if (leftBasename > rightBasename) return 1;
  return 0;
}

export async function generateReleaseChecksums(rootDirectory: string, platform: ReleasePlatform, architecture: string, outputPath: string): Promise<string[]> {
  const extensions = requiredExtensions[platform];
  const allFiles = await findFiles(rootDirectory);
  const releaseFiles = allFiles
    .filter((filePath) => extensions.includes(path.extname(filePath).toLowerCase()))
    .sort(compareArtifactPaths);

  for (const extension of extensions) {
    if (!releaseFiles.some((filePath) => path.extname(filePath).toLowerCase() === extension)) {
      throw new Error(`Missing ${platform}/${architecture} release artifact with ${extension} extension in ${rootDirectory}`);
    }
  }

  const basenames = releaseFiles.map((filePath) => path.basename(filePath));
  if (new Set(basenames).size !== basenames.length) {
    throw new Error(`Duplicate release artifact filename detected for ${platform}/${architecture}`);
  }

  const checksumLines = await Promise.all(releaseFiles.map(async (filePath) => `${await sha256(filePath)}  ${path.basename(filePath)}`));
  await writeFile(outputPath, `${checksumLines.join('\n')}\n`, 'utf8');
  return checksumLines;
}
