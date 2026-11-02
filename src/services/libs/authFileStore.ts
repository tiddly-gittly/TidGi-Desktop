import { randomUUID } from 'node:crypto';
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

interface AuthFileContents {
  version: 1;
  secrets: Record<string, string>;
}

/**
 * Plaintext, app-local credential storage. The local machine owner is
 * responsible for protecting this file; it intentionally avoids OS keychain
 * services and settings/database credential persistence.
 */
export class LocalAuthStore {
  private loaded = false;
  private secrets: Record<string, string> = createSecretsRecord();

  constructor(private readonly filename: string) {}

  get(key: string): string | undefined {
    this.ensureLoaded();
    return this.secrets[key];
  }

  set(key: string, value: string): void {
    this.ensureLoaded();
    if (this.secrets[key] === value) return;
    const nextSecrets = copySecrets(this.secrets);
    nextSecrets[key] = value;
    this.write(nextSecrets);
    this.secrets = nextSecrets;
  }

  delete(key: string): void {
    this.ensureLoaded();
    if (this.secrets[key] === undefined) return;
    const nextSecrets = copySecrets(this.secrets);
    delete nextSecrets[key];
    this.write(nextSecrets);
    this.secrets = nextSecrets;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    if (!existsSync(this.filename)) {
      this.loaded = true;
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.filename, 'utf8'));
    } catch {
      throw invalidAuthFileError(this.filename);
    }
    if (!isAuthFileContents(parsed)) throw invalidAuthFileError(this.filename);
    this.secrets = copySecrets(parsed.secrets);
    this.loaded = true;
  }

  private write(secrets: Record<string, string>): void {
    const directory = path.dirname(this.filename);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') chmodSync(directory, 0o700);

    const temporaryFilename = path.join(
      directory,
      `.${path.basename(this.filename)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temporaryFilename, 'wx', 0o600);
      writeFileSync(descriptor, JSON.stringify({ version: 1, secrets } satisfies AuthFileContents), 'utf8');
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporaryFilename, this.filename);
      if (process.platform !== 'win32') chmodSync(this.filename, 0o600);
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      if (existsSync(temporaryFilename)) unlinkSync(temporaryFilename);
    }
  }
}

let localAuthStore: LocalAuthStore | undefined;

/** Lazily create the process-wide store without filesystem access at import time. */
export function getLocalAuthStore(): LocalAuthStore {
  localAuthStore ??= new LocalAuthStore(path.join(app.getPath('userData'), 'auth.json'));
  return localAuthStore;
}

function isAuthFileContents(value: unknown): value is AuthFileContents {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.secrets)) return false;
  return Object.values(value.secrets).every(secret => typeof secret === 'string');
}

function copySecrets(secrets: Record<string, string>): Record<string, string> {
  const copy = createSecretsRecord();
  for (const [key, value] of Object.entries(secrets)) copy[key] = value;
  return copy;
}

function createSecretsRecord(): Record<string, string> {
  return Object.create(null) as Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidAuthFileError(filename: string): Error {
  return new Error(`Invalid local auth file: ${filename}`);
}
