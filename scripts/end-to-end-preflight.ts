import fs from 'fs';
import { spawn } from 'node:child_process';
import path from 'path';
import { writeCalibrationResult } from '../features/supports/calibration';
import { killProcessTree } from '../features/supports/killProcessTree';
import { isXDisplayReachable, isXvfbRunAvailable, reExecuteCurrentScriptUnderXvfb, requiresVirtualXDisplay } from './xDisplay';

// ═══════════════════════════════════════════════════════════════════════════
// X Display auto-detection — re-exec under xvfb-run when no DISPLAY is set.
// Shared with scripts/run-e2e.ts. Keep in sync.
// ═══════════════════════════════════════════════════════════════════════════
const XVFB_WRAPPED_ENV = 'TIDGI_E2E_XVFB_WRAPPED';

// Keep each calibration run bounded so a stuck Electron process cannot consume
// the entire CI job. This is a deadlock watchdog, not a test timeout budget:
// successful runs observed in CI complete well within this limit.
const CALIBRATION_RUN_WATCHDOG_MS = 15 * 60 * 1000;
const CALIBRATION_WATCHDOG_LOG_INTERVAL_MS = 30 * 1000;
const CALIBRATION_KILL_GRACE_MS = 10 * 1000;

function ensureXvfbWrapper(scriptLabel: string): void {
  if (process.env[XVFB_WRAPPED_ENV] === '1' || !requiresVirtualXDisplay(process.platform, isXDisplayReachable(process.env.DISPLAY))) return;

  if (!isXvfbRunAvailable()) {
    console.error(`[${scriptLabel}] No X display and xvfb-run not found. Install xvfb: sudo apt install xvfb`);
    process.exit(1);
  }

  console.warn(`[${scriptLabel}] No X display detected — re-executing under xvfb-run`);
  reExecuteCurrentScriptUnderXvfb(XVFB_WRAPPED_ENV);
}

interface StepTiming {
  name: string;
  durationMs: number;
}

interface CalibrationSamples {
  totalMs: number[];
  stepMs: number[];
  launchMs: number[];
  waitMs: number[];
  elementMs: number[];
}

interface CucumberRunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

function runCucumberWithWatchdog(
  arguments_: string[],
  runIndex: number,
  totalRuns: number,
): Promise<CucumberRunResult> {
  const startedAt = Date.now();
  const child = spawn(process.execPath, arguments_, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', TIDGI_E2E_IS_CALIBRATION: 'true' },
    // Give Unix runners a dedicated process group so the watchdog can reap
    // Electron, Playwright, and fixture descendants together.
    detached: process.platform !== 'win32',
  });

  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let killGraceTimer: NodeJS.Timeout | undefined;

    const watchdogTimer = setTimeout(() => {
      timedOut = true;
      const elapsedMs = Date.now() - startedAt;
      console.error(
        `[Cal] run ${runIndex}/${totalRuns} watchdog fired after ${elapsedMs}ms ` +
          `(limit=${CALIBRATION_RUN_WATCHDOG_MS}ms, pid=${child.pid ?? 'unknown'}); terminating process tree`,
      );
      killProcessTree(child.pid);
      killGraceTimer = setTimeout(() => {
        if (settled) return;
        console.error(`[Cal] run ${runIndex}/${totalRuns} child did not exit after watchdog kill; forcing parent termination`);
        try {
          child.kill('SIGKILL');
        } catch {
          // The child may have exited between the tree kill and this fallback.
        }
        finish(null, 'SIGKILL');
      }, CALIBRATION_KILL_GRACE_MS);
    }, CALIBRATION_RUN_WATCHDOG_MS);

    const heartbeatTimer = setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      console.log(`[Cal] run ${runIndex}/${totalRuns} still running (${elapsedMs}ms, pid=${child.pid ?? 'unknown'})`);
    }, CALIBRATION_WATCHDOG_LOG_INTERVAL_MS);

    const finish = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdogTimer);
      clearTimeout(killGraceTimer);
      clearInterval(heartbeatTimer);
      resolve({ exitCode, signal, timedOut });
    };

    child.once('error', (error) => {
      console.error(`[Cal] run ${runIndex}/${totalRuns} failed to start cucumber: ${String(error)}`);
      finish(1, null);
    });
    child.once('close', (exitCode, signal) => {
      finish(exitCode, signal);
    });
  });
}

async function runSmokeCalibration(): Promise<void> {
  // Two complete calibration runs to capture CI machine variance without
  // excessive build time. A single run can hide a slow step on a cold cache.
  const CALIBRATION_RUNS = 2;
  const calibrationArtifactsDirectory = path.resolve(process.cwd(), 'test-artifacts');
  const cucumberBin = path.resolve(process.cwd(), 'node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');

  const samples: CalibrationSamples = {
    totalMs: [],
    stepMs: [],
    launchMs: [],
    waitMs: [],
    elementMs: [],
  };

  fs.mkdirSync(calibrationArtifactsDirectory, { recursive: true });

  for (let runIndex = 0; runIndex < CALIBRATION_RUNS; runIndex++) {
    const startedAt = Date.now();
    const outputFileRelative = path.join('test-artifacts', `.calibration-raw-${runIndex + 1}.json`);
    const outputFile = path.resolve(process.cwd(), outputFileRelative);

    fs.rmSync(outputFile, { force: true });

    const cucumberResult = await runCucumberWithWatchdog(
      [cucumberBin, '--config', 'features/cucumber.config.js', '--profile', 'calibration', '--format', `json:${outputFileRelative}`, '--exit'],
      runIndex + 1,
      CALIBRATION_RUNS,
    );
    const cucumberExitOk = cucumberResult.exitCode === 0 && !cucumberResult.timedOut;
    if (!cucumberExitOk) {
      const outcome = cucumberResult.timedOut
        ? 'watchdog timeout'
        : `exit=${cucumberResult.exitCode ?? 'null'}${cucumberResult.signal ? ` signal=${cucumberResult.signal}` : ''}`;
      throw new Error(`[Cal] run ${runIndex + 1}/${CALIBRATION_RUNS} failed (${outcome}); raw report: ${outputFile}`);
    }

    const steps = extractStepTimings(outputFile);
    if (steps.length === 0) {
      const reason = cucumberExitOk ? 'cucumber exited zero but no step timings found' : 'no recoverable step timings in partial output';
      console.warn(`[Cal] run ${runIndex + 1}/${CALIBRATION_RUNS}: ${reason} — skipping`);
      continue;
    }

    const totalMs = Date.now() - startedAt;
    let runMaxStepMs = 0;
    let runMaxLaunchStepMs = 0;
    let runMaxWaitStepMs = 0;
    let runMaxElementStepMs = 0;

    for (const step of steps) {
      if (step.durationMs > runMaxStepMs) runMaxStepMs = step.durationMs;
      if (isLaunchStep(step.name) && step.durationMs > runMaxLaunchStepMs) {
        runMaxLaunchStepMs = step.durationMs;
      }
      if (isWaitStep(step.name) && step.durationMs > runMaxWaitStepMs) {
        runMaxWaitStepMs = step.durationMs;
      }
      if (isElementStep(step.name) && step.durationMs > runMaxElementStepMs) {
        runMaxElementStepMs = step.durationMs;
      }
    }

    // Step timeout = worst composite: a single step may involve launch + wait + click.
    const runCompositeMs = runMaxLaunchStepMs + runMaxWaitStepMs + runMaxElementStepMs;
    if (runCompositeMs > runMaxStepMs) runMaxStepMs = runCompositeMs;

    samples.totalMs.push(totalMs);
    samples.stepMs.push(runMaxStepMs);
    samples.launchMs.push(runMaxLaunchStepMs);
    samples.waitMs.push(runMaxWaitStepMs);
    samples.elementMs.push(runMaxElementStepMs);

    console.log(`[Cal] #${runIndex + 1}/${CALIBRATION_RUNS}: T=${totalMs} S=${runMaxStepMs} L=${runMaxLaunchStepMs} W=${runMaxWaitStepMs} E=${runMaxElementStepMs}`);
  }

  // Partial calibration is unsafe for downstream shards and local debugging alike.
  if (samples.totalMs.length === 0) {
    throw new Error(
      '[Cal] FATAL: All calibration runs failed. ' +
        'Downstream scenarios cannot use calibration — fix the @calibrate scenarios and re-run.',
    );
  }

  const observed = {
    totalMs: getObservedMax(samples.totalMs) ?? 0,
    stepMs: getObservedMax(samples.stepMs) ?? 0,
    launchMs: getObservedMax(samples.launchMs) ?? 0,
    waitMs: getObservedMax(samples.waitMs) ?? 0,
    elementMs: getObservedMax(samples.elementMs) ?? 0,
  };

  const stepMs = deriveMeasuredTimeoutBudget(samples.stepMs) ?? observed.stepMs;
  const totalMs = deriveMeasuredTimeoutBudget(samples.totalMs) ?? observed.totalMs;
  const launchMs = deriveMeasuredTimeoutBudget(samples.launchMs) ?? stepMs;
  const waitMs = deriveMeasuredTimeoutBudget(samples.waitMs) ?? stepMs;
  const elementMs = deriveMeasuredTimeoutBudget(samples.elementMs) ?? stepMs;

  writeCalibrationResult({
    totalMs,
    stepMs,
    launchMs,
    waitMs,
    elementMs,
    observed,
    sampleCount: samples.totalMs.length,
  });

  console.log(
    `[Cal] stored: S=${stepMs}ms L=${launchMs}ms W=${waitMs}ms E=${elementMs}ms ` +
      `(observed S=${observed.stepMs}ms L=${observed.launchMs}ms W=${observed.waitMs}ms E=${observed.elementMs}ms, samples=${samples.totalMs.length})`,
  );
}

function getObservedMax(samples: number[]): number | null {
  const validSamples = samples.filter(sample => Number.isFinite(sample) && sample > 0);
  if (validSamples.length === 0) return null;
  return Math.max(...validSamples);
}

function deriveMeasuredTimeoutBudget(samples: number[]): number | null {
  const validSamples = samples.filter(sample => Number.isFinite(sample) && sample > 0);
  if (validSamples.length === 0) return null;

  const observedMax = Math.max(...validSamples);
  const observedMin = Math.min(...validSamples);
  // The spread between runs is the primary error signal — CI jitter, cold-cache
  // variance, and background noise all manifest as inter-run differences. Exceeding spread means error on logic. Don't use hardcoded timeout or multiplyer to hide the underlying problem, it will only waste more time. Only look at log and code tounderstand the true problem. Don't be lazy.
  const spread = observedMax - observedMin;

  return Math.ceil(observedMax + spread);
}

function extractStepTimings(jsonFilePath: string): StepTiming[] {
  try {
    const raw = fs.readFileSync(jsonFilePath, 'utf-8');
    const report = JSON.parse(raw) as Array<Record<string, unknown>>;
    const timings: StepTiming[] = [];

    for (const feature of report) {
      for (const element of (feature.elements ?? []) as Array<Record<string, unknown>>) {
        for (const step of (element.steps ?? []) as Array<Record<string, unknown>>) {
          const result = step.result as { duration?: number } | undefined;
          const duration = result?.duration;
          const name = (step.name ?? '') as string;
          if (duration && name) {
            timings.push({ name, durationMs: Math.ceil(duration / 1_000_000) });
          }
        }
      }
    }

    return timings;
  } catch {
    return [];
  }
}

function isLaunchStep(name: string): boolean {
  return /launch|page to load|browser view.*loaded/i.test(name);
}

function isWaitStep(name: string): boolean {
  return /wait for|log entries|SSE|watch-fs/i.test(name);
}

function isElementStep(name: string): boolean {
  return /click|type|check/i.test(name);
}

ensureXvfbWrapper('test:e2e:calibrate');
void runSmokeCalibration().catch((error: unknown) => {
  console.error('[Cal] calibration preflight failed', error);
  process.exitCode = 1;
});
