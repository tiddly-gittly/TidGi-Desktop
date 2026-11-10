import { access, chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MacSmokeOutputTracker, parseMacArchitecture, prepareMacSmokeScenarioRoot, removeSensitiveEnvironmentVariables, resolvePackagedMacExecutable } from '../macOSPackagedSmoke';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })));
});

describe('macOS packaged smoke argument validation', () => {
  it.each(['x64', 'arm64'] as const)('accepts the supported %s architecture', architecture => {
    expect(parseMacArchitecture([`--arch=${architecture}`])).toBe(architecture);
  });

  it.each([[[]], [['--arch=ia32']], [['--arch=x86_64']]])('rejects a missing or unsupported architecture (%j)', arguments_ => {
    expect(() => parseMacArchitecture(arguments_)).toThrow('requires --arch=x64 or --arch=arm64');
  });
});

describe('smoke environment isolation', () => {
  it('removes credentials while retaining launch paths and non-sensitive flags', () => {
    const environment = {
      ACTIONS_RUNTIME_TOKEN: 'runtime-secret',
      AWS_SECRET_ACCESS_KEY: 'aws-secret',
      CPA_API_KEY: 'provider-secret',
      CSC_LINK: 'certificate-secret',
      GITHUB_TOKEN: 'github-secret',
      HOME: '/tmp/home',
      TIDGI_TEST_SCENARIO: 'smoke',
    };

    removeSensitiveEnvironmentVariables(environment);

    expect(environment).toEqual({ HOME: '/tmp/home', TIDGI_TEST_SCENARIO: 'smoke' });
  });
});

describe('resolvePackagedMacExecutable', () => {
  it('discovers the executable without depending on TidGi filename case', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'tidgi-mac-smoke-'));
    temporaryDirectories.push(projectRoot);
    const executableDirectory = path.join(projectRoot, 'out', 'TidGi-darwin-x64', 'TidGi.app', 'Contents', 'MacOS');
    await mkdir(executableDirectory, { recursive: true });
    const executable = path.join(executableDirectory, 'tidgi');
    await writeFile(executable, '#!/bin/sh\n');
    await chmod(executable, 0o755);

    await expect(resolvePackagedMacExecutable(projectRoot, 'x64')).resolves.toBe(executable);
  });
});

describe('prepareMacSmokeScenarioRoot', () => {
  it('creates the parent directory required by packaged default-wiki creation', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'tidgi-mac-smoke-scenario-'));
    temporaryDirectories.push(projectRoot);

    const scenarioRoot = await prepareMacSmokeScenarioRoot(projectRoot, 'arm64');

    await expect(access(path.join(scenarioRoot, 'wiki-test'))).resolves.toBeUndefined();
  });
});

describe('MacSmokeOutputTracker', () => {
  it('recognizes all milestones even when output is split across stream chunks', () => {
    const tracker = new MacSmokeOutputTracker();

    tracker.accept('test-id-WorkerServicesRe');
    tracker.accept('ady\nresolved with control boo');
    tracker.accept('ted\n[test-id-ALL_WORKSPACE_VIEW_');
    tracker.accept('INITIALIZED] All workspace views initialized\nDeviceNetworkService ');
    tracker.accept('started');

    expect(tracker.complete).toBe(true);
    expect(tracker.failure).toBeUndefined();
    expect(tracker.missingDescriptions).toEqual([]);
  });

  it('reports missing milestones and a split UtilityProcess crash', () => {
    const tracker = new MacSmokeOutputTracker();

    tracker.accept('Peer process exited with co');
    tracker.accept('de 1');

    expect(tracker.complete).toBe(false);
    expect(tracker.failure).toBe('Electron utility peer exited');
    expect(tracker.missingDescriptions).toHaveLength(4);
  });
});
