import fs from 'fs';
import { execFileSync } from 'node:child_process';
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
    } catch (error) {
      throw new Error(`[Cal] run ${runIndex + 1}/${CALIBRATION_RUNS} failed; raw report: ${outputFile}`, { cause: error });
    }

    const steps = extractStepTimings(outputFile);
    if (steps.length === 0) {
      throw new Error(`[Cal] run ${runIndex + 1}/${CALIBRATION_RUNS} returned no step timings; raw report: ${outputFile}`);
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
  // The measured spread accounts for cold-cache and runner-load differences
  // while keeping the budget tied to observed calibration runs.
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

try {
  runSmokeCalibration();
} catch (error) {
  console.error('[Cal] calibration preflight failed', error);
  process.exitCode = 1;
}
