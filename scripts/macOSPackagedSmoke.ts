#!/usr/bin/env tsx

import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, type WriteStream } from 'node:fs';
import { access, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export type MacArchitecture = 'arm64' | 'x64';

const DEFAULT_TIMEOUT_MILLISECONDS = 90_000;
const STABILITY_WINDOW_MILLISECONDS = 5_000;
const SHUTDOWN_TIMEOUT_MILLISECONDS = 5_000;
const OUTPUT_SCAN_CARRY_LENGTH = 512;

export const REQUIRED_MAC_SMOKE_MILESTONES = [
  {
    key: 'wikiUtilityProcessServices',
    description: 'Wiki UtilityProcess completed its host-service IPC handshake',
    text: 'test-id-WorkerServicesReady',
  },
  {
    key: 'wikiUtilityProcess',
    description: 'Wiki UtilityProcess reported that TiddlyWiki booted',
    text: 'resolved with control booted',
  },
  {
    key: 'workspaceViews',
    description: 'main process finished initializing all workspace views',
    text: '[test-id-ALL_WORKSPACE_VIEW_INITIALIZED]',
  },
  {
    key: 'deviceNetworkPeer',
    description: 'MemeLoop DeviceNetwork/libp2p peer started',
    text: 'DeviceNetworkService started',
  },
] as const;

const FATAL_MAC_SMOKE_PATTERNS = [
  { description: 'application ready handler failed', pattern: /Error during app ready handler/u },
  { description: 'DeviceNetwork/libp2p peer failed to start', pattern: /Failed to start DeviceNetworkService/u },
  { description: 'wiki UtilityProcess exited', pattern: /NodeJSWiki .* Worker stopped with code/u },
  { description: 'wiki UtilityProcess crashed', pattern: /Worker stopped (?:before wiki boot completed|with exit code)/u },
  { description: 'Electron utility peer exited', pattern: /Peer process exited with code/u },
  { description: 'wiki UtilityProcess uncaught exception', pattern: /\[wikiWorker\] Uncaught exception/u },
  { description: 'wiki UtilityProcess unhandled rejection', pattern: /\[wikiWorker\] Unhandled rejection/u },
  { description: 'main process unhandled rejection', pattern: /Unhandled Promise Rejection/u },
  { description: 'main process uncaught exception', pattern: /Uncaught Exception/u },
  { description: 'main process global unhandled-error boundary fired', pattern: /"message":"unhandled"/u },
] as const;

type MacSmokeMilestoneKey = typeof REQUIRED_MAC_SMOKE_MILESTONES[number]['key'];

export class MacSmokeOutputTracker {
  private carry = '';
  private fatalDescription: string | undefined;
  private readonly observed = new Set<MacSmokeMilestoneKey>();

  public accept(chunk: string): void {
    const scanText = `${this.carry}${chunk}`;
    for (const milestone of REQUIRED_MAC_SMOKE_MILESTONES) {
      if (scanText.includes(milestone.text)) this.observed.add(milestone.key);
    }
    if (this.fatalDescription === undefined) {
      this.fatalDescription = FATAL_MAC_SMOKE_PATTERNS.find(({ pattern }) => pattern.test(scanText))?.description;
    }
    this.carry = scanText.slice(-OUTPUT_SCAN_CARRY_LENGTH);
  }

  public get failure(): string | undefined {
    return this.fatalDescription;
  }

  public get complete(): boolean {
    return REQUIRED_MAC_SMOKE_MILESTONES.every(({ key }) => this.observed.has(key));
  }

  public get missingDescriptions(): string[] {
    return REQUIRED_MAC_SMOKE_MILESTONES
      .filter(({ key }) => !this.observed.has(key))
      .map(({ description }) => description);
  }
}

export function parseMacArchitecture(arguments_: readonly string[]): MacArchitecture {
  const architectureArgument = arguments_.find(argument => argument.startsWith('--arch='));
  const architecture = architectureArgument?.slice('--arch='.length);
  if (architecture === 'arm64' || architecture === 'x64') return architecture;
  throw new Error('macOS packaged smoke requires --arch=x64 or --arch=arm64');
}

/**
 * Resolve the executable from the bundle instead of assuming its case. Forge's
 * product name and executableName have differed historically on macOS.
 */
export async function resolvePackagedMacExecutable(projectRoot: string, architecture: MacArchitecture): Promise<string> {
  const appBundle = path.resolve(projectRoot, 'out', `TidGi-darwin-${architecture}`, 'TidGi.app');
  const executableDirectory = path.join(appBundle, 'Contents', 'MacOS');
  const candidates = await readdir(executableDirectory);
  const preferredCandidates = candidates.toSorted((left, right) => {
    const leftPreferred = left.toLowerCase() === 'tidgi' ? 0 : 1;
    const rightPreferred = right.toLowerCase() === 'tidgi' ? 0 : 1;
    return leftPreferred - rightPreferred || left.localeCompare(right);
  });
  for (const candidate of preferredCandidates) {
    const executable = path.join(executableDirectory, candidate);
    const information = await stat(executable);
    if (!information.isFile()) continue;
    try {
      await access(executable, 1);
      return executable;
    } catch {
      // Continue looking for the actual Mach-O executable.
    }
  }
  throw new Error(`No executable file was found in ${executableDirectory}`);
}

export async function prepareMacSmokeScenarioRoot(projectRoot: string, architecture: MacArchitecture): Promise<string> {
  const artifactsRoot = path.resolve(projectRoot, 'test-artifacts');
  const scenarioRoot = path.join(artifactsRoot, `mac-packaged-smoke-${architecture}`);
  if (path.dirname(scenarioRoot) !== artifactsRoot) throw new Error('Refusing to reset a smoke directory outside test-artifacts');
  await rm(scenarioRoot, { force: true, recursive: true });
  // The packaged app creates the default wiki inside this container, but its
  // createWiki contract deliberately requires the selected parent to exist.
  // Playwright's scenario fixture normally prepares it; this standalone smoke
  // must provide the same filesystem precondition itself.
  await mkdir(path.join(scenarioRoot, 'wiki-test'), { recursive: true });
  return scenarioRoot;
}

function assertExecutableArchitecture(executable: string, architecture: MacArchitecture): void {
  const result = spawnSync('/usr/bin/lipo', ['-archs', executable], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`lipo could not inspect ${executable}: ${result.stderr.trim()}`);
  }
  const expectedArchitecture = architecture === 'x64' ? 'x86_64' : 'arm64';
  const actualArchitectures = result.stdout.trim().split(/\s+/u);
  if (!actualArchitectures.includes(expectedArchitecture)) {
    throw new Error(`Expected ${executable} to contain ${expectedArchitecture}, found: ${actualArchitectures.join(', ')}`);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    // The app is spawned detached so the negative PID targets Electron and all
    // helper/UtilityProcess descendants rather than leaving CI orphans behind.
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

async function terminateProcessGroup(child: ChildProcess, exitPromise: Promise<void>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalProcessGroup(child, 'SIGTERM');
  const graceful = await Promise.race([
    exitPromise.then(() => true),
    delay(SHUTDOWN_TIMEOUT_MILLISECONDS).then(() => false),
  ]);
  if (graceful) return;
  signalProcessGroup(child, 'SIGKILL');
  await Promise.race([exitPromise, delay(2_000)]);
}

async function closeOutput(output: WriteStream): Promise<void> {
  if (output.closed || output.destroyed) return;
  await new Promise<void>(resolve => {
    const settle = (): void => {
      output.removeListener('close', settle);
      output.removeListener('error', settle);
      output.removeListener('finish', settle);
      resolve();
    };
    output.once('close', settle);
    output.once('error', settle);
    output.once('finish', settle);
    output.end();
  });
}

function timeoutFromEnvironment(environment: NodeJS.ProcessEnv): number {
  const rawTimeout = environment.TIDGI_MAC_SMOKE_TIMEOUT_MS;
  if (rawTimeout === undefined) return DEFAULT_TIMEOUT_MILLISECONDS;
  const timeout = Number(rawTimeout);
  if (!Number.isSafeInteger(timeout) || timeout < 10_000 || timeout > 180_000) {
    throw new Error('TIDGI_MAC_SMOKE_TIMEOUT_MS must be an integer between 10000 and 180000');
  }
  return timeout;
}

export function removeSensitiveEnvironmentVariables(environment: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(environment)) {
    if (/(?:API_KEY|PASSWORD|SECRET|TOKEN|ACCESS_KEY)(?:$|_)/iu.test(key) || key === 'CSC_LINK') delete environment[key];
  }
}

export async function runMacOSPackagedSmoke(
  projectRoot: string,
  architecture: MacArchitecture,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('macOS packaged smoke must run on a macOS host');

  const executable = await resolvePackagedMacExecutable(projectRoot, architecture);
  assertExecutableArchitecture(executable, architecture);

  const scenarioSlug = `mac-packaged-smoke-${architecture}`;
  const scenarioRoot = await prepareMacSmokeScenarioRoot(projectRoot, architecture);
  const outputPath = path.join(scenarioRoot, 'mac-packaged-smoke-output.log');
  const output = createWriteStream(outputPath, { flags: 'w' });
  let outputError: Error | undefined;
  output.on('error', error => {
    outputError = error;
  });
  const tracker = new MacSmokeOutputTracker();

  const childEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    CI: 'true',
    E2E_TEST: 'true',
    ELECTRON_DISABLE_HARDWARE_ACCELERATION: 'true',
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ELECTRON_ENABLE_LOGGING: 'true',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    NODE_ENV: 'test',
    TIDGI_TEST_SCENARIO: scenarioSlug,
  };
  // A fresh smoke profile does not need provider, registry, signing, or GitHub
  // credentials. Do not expose a runner/local shell secret to the app merely
  // because it happened to be present in the parent environment.
  removeSensitiveEnvironmentVariables(childEnvironment);
  // This leaks into child environments when focused unit tests use Electron as
  // Node. A GUI Electron bundle cannot launch while it is set.
  delete childEnvironment.ELECTRON_RUN_AS_NODE;

  const child = spawn(executable, [
    '--disable-background-timer-throttling',
    '--disable-gpu',
    '--disable-renderer-backgrounding',
    '--use-mock-keychain',
  ], {
    cwd: projectRoot,
    detached: true,
    env: childEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let exited: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  let spawnError: Error | undefined;
  const exitPromise = new Promise<void>(resolve => {
    child.once('error', error => {
      spawnError = error;
      resolve();
    });
    child.once('exit', (code, signal) => {
      exited = { code, signal };
      resolve();
    });
  });
  const capture = (source: 'stderr' | 'stdout', chunk: Buffer): void => {
    const text = chunk.toString('utf8');
    tracker.accept(text);
    output.write(`[${source}] ${text}`);
    process.stdout.write(`[mac-packaged-smoke:${source}] ${text}`);
  };
  child.stdout?.on('data', (chunk: Buffer) => {
    capture('stdout', chunk);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    capture('stderr', chunk);
  });

  const deadline = Date.now() + timeoutFromEnvironment(environment);
  let milestonesObservedAt: number | undefined;
  let smokeError: Error | undefined;
  let completed = false;
  try {
    while (Date.now() < deadline) {
      if (outputError !== undefined) throw new Error(`Could not write smoke diagnostics: ${outputError.message}`);
      if (spawnError !== undefined) throw new Error(`Could not launch packaged TidGi: ${spawnError.message}`);
      if (exited !== undefined) {
        throw new Error(`Packaged TidGi exited before smoke completion (code=${String(exited.code)}, signal=${String(exited.signal)})`);
      }
      if (tracker.failure !== undefined) throw new Error(`Packaged TidGi reported a fatal startup condition: ${tracker.failure}`);
      if (tracker.complete) {
        milestonesObservedAt ??= Date.now();
        if (Date.now() - milestonesObservedAt >= STABILITY_WINDOW_MILLISECONDS) {
          completed = true;
          break;
        }
      }
      await delay(250);
    }
    if (!completed) throw new Error(`Timed out waiting for: ${tracker.missingDescriptions.join('; ') || 'post-start stability window'}`);
  } catch (error) {
    smokeError = error instanceof Error ? error : new Error(String(error));
  }
  let terminationError: Error | undefined;
  try {
    await terminateProcessGroup(child, exitPromise);
  } catch (error) {
    terminationError = error instanceof Error ? error : new Error(String(error));
  }
  await closeOutput(output);
  if (smokeError !== undefined) {
    console.error(`[mac-packaged-smoke] Diagnostics: ${outputPath}`);
    console.error(`[mac-packaged-smoke] Structured logs: ${path.join(scenarioRoot, 'userData-test', 'logs')}`);
  }
  if (terminationError !== undefined) {
    if (smokeError !== undefined) {
      console.error(`[mac-packaged-smoke] Additional cleanup failure: ${terminationError.message}`);
    } else {
      smokeError = new Error(`Could not clean up the packaged app process group: ${terminationError.message}`);
    }
  }
  if (smokeError !== undefined) throw smokeError;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && entry.replaceAll('\\', '/').endsWith('/scripts/macOSPackagedSmoke.ts');
}

if (isDirectExecution()) {
  if (!existsSync(path.resolve(process.cwd(), 'package.json'))) {
    console.error('[mac-packaged-smoke] Run this script from the TidGi-Desktop repository root.');
    process.exitCode = 1;
  } else {
    runMacOSPackagedSmoke(process.cwd(), parseMacArchitecture(process.argv.slice(2))).then(
      () => {
        console.log('[mac-packaged-smoke] PASS: packaged app, Wiki UtilityProcess, workspace renderer, and MemeLoop peer stayed healthy.');
      },
      (error: unknown) => {
        console.error(`[mac-packaged-smoke] FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
        process.exitCode = 1;
      },
    );
  }
}
