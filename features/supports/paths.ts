import fs from 'fs';
import path from 'path';

export function getPackedAppPath(): string {
  const platform = process.platform;
  const outputDirectory = path.join(process.cwd(), 'out');

  // Define possible app paths based on platform
  const possiblePaths: string[] = [];

  switch (platform) {
    case 'win32':
      possiblePaths.push(
        path.join(outputDirectory, 'TidGi-win32-x64', 'tidgi.exe'),
        path.join(outputDirectory, 'TidGi-win32-arm64', 'tidgi.exe'),
        path.join(outputDirectory, 'TidGi-win32-ia32', 'tidgi.exe'),
      );
      break;
    case 'darwin':
      possiblePaths.push(
        path.join(outputDirectory, 'TidGi-darwin-x64', 'TidGi.app', 'Contents', 'MacOS', 'TidGi'),
        path.join(outputDirectory, 'TidGi-darwin-arm64', 'TidGi.app', 'Contents', 'MacOS', 'TidGi'),
      );
      break;
    case 'linux':
      possiblePaths.push(
        path.join(outputDirectory, 'TidGi-linux-x64', 'tidgi'),
        path.join(outputDirectory, 'TidGi-linux-arm64', 'tidgi'),
      );
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  // Find the first existing executable
  for (const appPath of possiblePaths) {
    if (fs.existsSync(appPath)) {
      return appPath;
    }
  }

  throw new Error(
    `TidGi executable not found. Checked paths:\n${possiblePaths.join('\n')}\n\nYou should run \`pnpm run test:prepare-e2e\` before running the tests to ensure the app is built.`,
  );
}

// E2E logs paths used by tests
export const logsDirectory = path.resolve(process.cwd(), 'userData-test', 'logs');
export const screenshotsDirectory = path.resolve(logsDirectory, 'screenshots');
// Test settings paths used by E2E
export const settingsDirectory = path.resolve(process.cwd(), 'userData-test', 'settings');
export const settingsPath = path.resolve(settingsDirectory, 'settings.json');

// Repo root and test wiki paths
export const repoRoot = path.resolve(process.cwd());
export const wikiTestRootPath = path.resolve(repoRoot, 'wiki-test'); // Root of all test wikis
export const wikiTestWikiPath = path.resolve(wikiTestRootPath, 'wiki'); // Main test wiki

// Archive-safe sanitization: generate a slug that is safe for zipping/unzipping across platforms.
// Rules:
// - allow Unicode letters/numbers (\p{L}\p{N}) and spaces, hyphen, underscore and parentheses
// - remove dots completely (to avoid trailing-dot issues on Windows)
// - replace any other char with '-' (this includes brackets, quotes, punctuation)
// - collapse multiple '-' into one, collapse multiple spaces into one, trim, and limit length
const unsafeChars = /[^\p{L}\p{N}\s\-_()]/gu;
const collapseDashes = /-+/g;
const collapseSpaces = /\s+/g;
export const makeSlugPath = (input: string | undefined, maxLength = 120) => {
  let s = String(input || 'unknown').normalize('NFKC');
  // remove dots explicitly
  s = s.replace(/\./g, '');
  // replace unsafe characters with dashes
  let slug = s.replace(unsafeChars, '-');
  // collapse consecutive dashes
  slug = slug.replace(collapseDashes, '-');
  // collapse spaces to single space, trim edges
  slug = slug.replace(collapseSpaces, ' ').trim();
  // trim leading/trailing dashes or spaces
  slug = slug.replace(/^-+|-+$/g, '').replace(/^[\s]+|[\s]+$/g, '');
  if (slug.length > maxLength) slug = slug.substring(0, maxLength);
  if (!slug) slug = 'unknown';
  return slug;
};
