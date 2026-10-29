import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LocalAuthStore } from '../authFileStore';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('LocalAuthStore', () => {
  it('persists, reloads, and deletes secrets in a mode-restricted auth file', () => {
    const filename = authFilename();
    const store = new LocalAuthStore(filename);

    expect(store.get('provider/example')).toBeUndefined();
    store.set('provider/example', 'test-auth-value');

    expect(JSON.parse(readFileSync(filename, 'utf8'))).toEqual({
      version: 1,
      secrets: { 'provider/example': 'test-auth-value' },
    });
    expect(new LocalAuthStore(filename).get('provider/example')).toBe('test-auth-value');

    if (process.platform !== 'win32') {
      expect(statSync(filename).mode & 0o777).toBe(0o600);
      expect(statSync(path.dirname(filename)).mode & 0o777).toBe(0o700);
    }

    store.delete('provider/example');
    expect(new LocalAuthStore(filename).get('provider/example')).toBeUndefined();
  });

  it('reports malformed content without deleting the file', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'tidgi-auth-store-'));
    temporaryDirectories.push(directory);
    const filename = path.join(directory, 'auth.json');
    const malformed = '{"version": 1, "secrets": {"provider/example": "test-auth-value"} trailing';
    writeFileSync(filename, malformed, 'utf8');

    expect(() => new LocalAuthStore(filename).get('provider/example'))
      .toThrow(`Invalid local auth file: ${filename}`);
    expect(readFileSync(filename, 'utf8')).toBe(malformed);
  });

  it('keeps the prior snapshot after a failed atomic write so retrying persists it', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'tidgi-auth-store-'));
    temporaryDirectories.push(directory);
    const authDirectory = path.join(directory, 'auth');
    const filename = path.join(authDirectory, 'auth.json');
    writeFileSync(authDirectory, 'not a directory', 'utf8');
    const store = new LocalAuthStore(filename);

    expect(() => {
      store.set('provider/example', 'test-auth-value');
    }).toThrow();
    expect(store.get('provider/example')).toBeUndefined();

    rmSync(authDirectory);
    mkdirSync(authDirectory);
    store.set('provider/example', 'test-auth-value');
    expect(new LocalAuthStore(filename).get('provider/example')).toBe('test-auth-value');
  });
});

function authFilename(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tidgi-auth-store-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'auth', 'auth.json');
}
