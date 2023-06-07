import type Sqlite3Database from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'path';
import { arch, platform } from 'process';

const supportedPlatforms: Array<[string, string]> = [
  ['darwin', 'x64'],
  ['darwin', 'arm64'],
  ['linux', 'x64'],
];

function validPlatform(platform: string, arch: string): boolean {
  return supportedPlatforms.find(([p, a]) => platform === p && arch === a) !== null;
}

function extensionSuffix(platform: string): string {
  if (platform === 'win32') return 'dll';
  if (platform === 'darwin') return 'dylib';
  return 'so';
}

function platformPackageName(platform: string, arch: string): string {
  const os = platform === 'win32' ? 'windows' : platform;
  return `sqlite-vss-${os}-${arch}`;
}

function loadablePathResolver(name: string, PACKAGE_PATH_BASE: string): string {
  if (!validPlatform(platform, arch)) {
    throw new Error(
      `Unsupported platform for sqlite-vss, on a ${platform}-${arch} machine, but not in supported platforms (${
        supportedPlatforms
          .map(([p, a]) => `${p}-${a}`)
          .join(',')
      }). Consult the sqlite-vss NPM package README for details. `,
    );
  }
  const packageName = platformPackageName(platform, arch);
  const loadablePath = path.join(
    PACKAGE_PATH_BASE,
    packageName,
    'lib',
    `${name}.${extensionSuffix(platform)}`,
  );
  if (fs.statSync(loadablePath, { throwIfNoEntry: false }) === undefined) {
    throw new Error(
      `Loadble extension for sqlite-vss not found in ${loadablePath}. Was the ${packageName} package installed? Avoid using the --no-optional flag, as the optional dependencies for sqlite-vss are required.`,
    );
  }

  return loadablePath;
}

export function getVectorLoadablePath(PACKAGE_PATH_BASE: string): string {
  return loadablePathResolver('vector0', PACKAGE_PATH_BASE);
}

export function getVssLoadablePath(PACKAGE_PATH_BASE: string): string {
  return loadablePathResolver('vss0', PACKAGE_PATH_BASE);
}

export function loadVector(database: Sqlite3Database.Database, PACKAGE_PATH_BASE: string): void {
  database.loadExtension(getVectorLoadablePath(PACKAGE_PATH_BASE));
}

export function loadVss(database: Sqlite3Database.Database, PACKAGE_PATH_BASE: string): void {
  database.loadExtension(getVssLoadablePath(PACKAGE_PATH_BASE));
}

export function loadSqliteVss(database: Sqlite3Database.Database, PACKAGE_PATH_BASE: string): void {
  loadVector(database, PACKAGE_PATH_BASE);
  loadVss(database, PACKAGE_PATH_BASE);
}
