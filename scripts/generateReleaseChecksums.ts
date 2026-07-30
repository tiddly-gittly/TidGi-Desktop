import { generateReleaseChecksums, ReleasePlatform } from './releaseChecksums';

const [rootDirectory, platform, architecture, outputPath] = process.argv.slice(2);

if (rootDirectory === undefined || platform === undefined || architecture === undefined || outputPath === undefined || !['linux', 'mac', 'win'].includes(platform)) {
  throw new Error('Usage: tsx scripts/generateReleaseChecksums.ts <root-directory> <linux|mac|win> <architecture> <output-path>');
}

const checksumLines = await generateReleaseChecksums(rootDirectory, platform as ReleasePlatform, architecture, outputPath);
console.log(`Wrote ${checksumLines.length} ${platform}/${architecture} release checksums to ${outputPath}`);
