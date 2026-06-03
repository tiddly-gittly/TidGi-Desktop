import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { writeCalibrationResult } from '../features/supports/calibration';

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

function runSmokeCalibration(): void {
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

    let cucumberExitOk = false;
    try {
      execFileSync(
        process.execPath,
        [cucumberBin, '--config', 'features/cucumber.config.js', '--profile', 'calibration', '--format', `json:${outputFileRelative}`, '--exit'],
        {
          stdio: 'inherit',
          cwd: process.cwd(),
          env: { ...process.env, NODE_ENV: 'test', TIDGI_E2E_IS_CALIBRATION: 'true' },
        },
      );
      cucumberExitOk = true;
    } catch {
      // Non-zero exit means at least one @calibrate scenario failed.
      // We still try to extract timings from the JSON — cucumber writes
      // per-scenario results as they complete, so partial data is valid.
      console.warn(`[Cal] run ${runIndex + 1}/${CALIBRATION_RUNS} had non-zero exit — extracting partial timings`);
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
  // variance, and background noise all manifest as inter-run differences.
  const spread = observedMax - observedMin;
  // Enforce a minimum 10 % margin so that two nearly-identical runs still
  // provide a safety cushion for one-off spikes.
  const minMargin = Math.ceil(observedMax * 0.1);
  const measuredMargin = Math.max(spread, minMargin);

  return Math.ceil(observedMax + measuredMargin);
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

runSmokeCalibration();
