/**
 * Trim unused git commands and components from dugite to reduce package size.
 *
 * dugite bundles a full git distribution, but TidGi only uses a subset of git commands
 * through git-sync-js. Most git-xxx symlinks point to the main 'git' binary and are
 * only needed when directly invoking 'git-add' instead of 'git add'. Since dugite
 * always calls 'git/bin/git' with subcommand arguments, these symlinks are unnecessary.
 *
 * Additionally, Git Credential Manager (.NET runtime) and git-lfs are large components
 * that TidGi doesn't need because:
 * - Credentials are embedded directly in URLs (https://user:token@github.com/...)
 * - LFS is not used for TiddlyWiki wikis
 *
 * This can reduce package size by ~40-60MB depending on platform.
 */
import fs from 'fs-extra';
import path from 'path';

/** Unused standalone git commands (shell scripts and binaries) that TidGi doesn't use */
const UNUSED_GIT_COMMANDS = [
  // CVS/Arch integration (legacy VCS)
  'git-archimport',
  'git-cvsexportcommit',
  'git-cvsimport',
  'git-cvsserver',
  // Server/daemon functionality (desktop app doesn't need)
  'git-daemon',
  'git-http-backend',
  'git-http-fetch',
  'git-http-push',
  'git-shell',
  'git-upload-archive',
  // Email integration (not used)
  'git-imap-send',
  'git-send-email',
  // Web UI (not used)
  'git-instaweb',
  'git-web--browse',
  // Interactive merge tools (TidGi handles conflicts differently)
  'git-difftool--helper',
  'git-mergetool',
  'git-mergetool--lib',
  // Advanced features not used
  'git-filter-branch',
  'git-quiltimport',
  'git-request-pull',
  // Shell helpers (not needed for programmatic use)
  'git-sh-i18n',
  'git-sh-i18n--envsubst',
  'git-sh-setup',
  // Merge strategy scripts (git binary has these built-in)
  'git-merge-octopus',
  'git-merge-one-file',
  'git-merge-resolve',
  // Large repo optimization (TiddlyWiki repos are small)
  'scalar',
];

/** Patterns matching Git Credential Manager and .NET runtime files */
const GCM_FILE_PATTERNS = [
  /\.dll$/,
  /\.dylib$/,
  /^git-credential-manager/,
  /^gcmcore\./,
  /^createdump$/,
  /^Avalonia\./,
  /^Microsoft\./,
  /^System\./,
  /^GitHub\.dll$/,
  /^GitLab\.dll$/,
  /^Atlassian\./,
  /^HarfBuzzSharp\./,
  /^SkiaSharp\./,
  /^MicroCom\./,
  /^Tmds\./,
  /^netstandard\.dll$/,
  /^mscorlib\.dll$/,
  /^WindowsBase\.dll$/,
  /^NOTICE$/,
  /^uninstall\.sh$/,
];

/**
 * Remove all symlinks from a directory
 * @returns Number of symlinks removed
 */
function removeSymlinks(directory: string): number {
  let removed = 0;
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      const fullPath = path.join(directory, entry.name);
      try {
        fs.unlinkSync(fullPath);
        removed++;
      } catch {
        console.warn(`Failed to remove symlink: ${entry.name}`);
      }
    }
  }

  return removed;
}

/**
 * Remove a list of files/commands from a directory
 * @returns Object with count and bytes removed
 */
function removeFiles(directory: string, files: string[]): { count: number; bytes: number } {
  let count = 0;
  let bytes = 0;

  for (const file of files) {
    const filePath = path.join(directory, file);
    const filePathExe = path.join(directory, `${file}.exe`);

    for (const p of [filePath, filePathExe]) {
      if (fs.existsSync(p)) {
        try {
          const stats = fs.statSync(p);
          bytes += stats.size;
          fs.unlinkSync(p);
          count++;
        } catch {
          console.warn(`Failed to remove: ${path.basename(p)}`);
        }
      }
    }
  }

  return { count, bytes };
}

/**
 * Remove files matching patterns from a directory
 * @returns Object with count and bytes removed
 */
function removeMatchingFiles(directory: string, patterns: RegExp[]): { count: number; bytes: number } {
  let count = 0;
  let bytes = 0;

  const entries = fs.readdirSync(directory);
  for (const entry of entries) {
    if (patterns.some(pattern => pattern.test(entry))) {
      const fullPath = path.join(directory, entry);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          bytes += stats.size;
          fs.unlinkSync(fullPath);
          count++;
        }
      } catch {
        // Ignore errors
      }
    }
  }

  return { count, bytes };
}

/**
 * Main function to trim unused git commands from dugite
 */
export function trimUnusedGitCommands(dugitePath: string, platform: string): void {
  const gitCoreDirectory = platform === 'win32'
    ? path.join(dugitePath, 'git', 'mingw64', 'libexec', 'git-core')
    : path.join(dugitePath, 'git', 'libexec', 'git-core');

  if (!fs.existsSync(gitCoreDirectory)) {
    console.warn(`git-core directory not found: ${gitCoreDirectory}`);
    return;
  }

  let totalFilesRemoved = 0;
  let totalBytesRemoved = 0;

  // 1. Remove all symlinks - they're not needed when using dugite's exec()
  // dugite calls 'git' binary directly with subcommand arguments
  const symlinksRemoved = removeSymlinks(gitCoreDirectory);
  totalFilesRemoved += symlinksRemoved;
  console.log(`  Removed ${symlinksRemoved} symlinks`);

  // 2. Remove unused standalone git commands
  const commandsResult = removeFiles(gitCoreDirectory, UNUSED_GIT_COMMANDS);
  totalFilesRemoved += commandsResult.count;
  totalBytesRemoved += commandsResult.bytes;

  // 3. Remove Git LFS (13MB) - TiddlyWiki wikis don't use LFS
  const lfsResult = removeFiles(gitCoreDirectory, ['git-lfs']);
  if (lfsResult.count > 0) {
    totalFilesRemoved += lfsResult.count;
    totalBytesRemoved += lfsResult.bytes;
    console.log(`  Removed git-lfs (${(lfsResult.bytes / 1024 / 1024).toFixed(0)}MB)`);
  }

  // 4. Remove Git Credential Manager and .NET runtime (~26MB on macOS)
  // TidGi embeds credentials directly in URLs, so GCM is not needed
  const gcmResult = removeMatchingFiles(gitCoreDirectory, GCM_FILE_PATTERNS);
  if (gcmResult.count > 0) {
    totalFilesRemoved += gcmResult.count;
    totalBytesRemoved += gcmResult.bytes;
    console.log(`  Removed Git Credential Manager and .NET runtime (${gcmResult.count} files)`);
  }

  console.log(`  Total: removed ${totalFilesRemoved} files, saved ${(totalBytesRemoved / 1024 / 1024).toFixed(1)}MB`);
}
