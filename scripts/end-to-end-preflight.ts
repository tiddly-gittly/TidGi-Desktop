import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { writeCalibrationResult } from '../features/supports/calibration';

interface StepTiming {
  name: string;
  durationMs: number;
}

function runSmokeCalibration(): void {
  // Two complete calibration runs to capture CI machine variance without
  // excessive build time. A single run can hide a slow step on a cold cache.
  const CALIBRATION_RUNS = 2;
  const calibrationArtifactsDirectory = path.resolve(process.cwd(), 'test-artifacts');
  const cucumberBin = path.resolve(process.cwd(), 'node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');

  let maxTotalMs = 0;
  let maxStepMs = 0;
  let maxLaunchStepMs = 0;
  let maxWaitStepMs = 0;
  let maxElementStepMs = 0;

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
    } catch {
      // Non-zero exit means at least one @calibrate scenario failed.
      // Partial calibration is unsafe: excluding a failed heavy calibrator
      // under-measures the timeout and shifts the real failure downstream.
      console.warn(`[Cal] run ${runIndex + 1}/${CALIBRATION_RUNS} failed (non-zero exit) — skipping entire run`);
      continue;
    }

    // Only extract timings from complete successful runs — cucumber exited zero.
    const steps = extractStepTimings(outputFile);
    if (steps.length === 0) {
      console.warn(`[Cal] run ${runIndex + 1}/${CALIBRATION_RUNS}: cucumber exited zero but no step timings found — skipping`);
      continue;
    }

    const totalMs = Date.now() - startedAt;

    if (totalMs > maxTotalMs) maxTotalMs = totalMs;

    for (const step of steps) {
      if (step.durationMs > maxStepMs) maxStepMs = step.durationMs;
      if (isLaunchStep(step.name) && step.durationMs > maxLaunchStepMs) {
        maxLaunchStepMs = step.durationMs;
      }
      if (isWaitStep(step.name) && step.durationMs > maxWaitStepMs) {
        maxWaitStepMs = step.durationMs;
      }
      if (isElementStep(step.name) && step.durationMs > maxElementStepMs) {
        maxElementStepMs = step.durationMs;
      }
    }

    // Step timeout = worst composite: a single step may involve launch + wait + click.
    const compositeMs = maxLaunchStepMs + maxWaitStepMs + maxElementStepMs;
    if (compositeMs > maxStepMs) maxStepMs = compositeMs;

    console.log(`[Cal] #${runIndex + 1}/${CALIBRATION_RUNS}: T=${totalMs} S=${maxStepMs} L=${maxLaunchStepMs} W=${maxWaitStepMs} E=${maxElementStepMs}`);
  }

  // Partial calibration is unsafe for downstream shards and local debugging alike.
  if (maxTotalMs === 0) {
    throw new Error(
      '[Cal] FATAL: All calibration runs failed. ' +
        'Downstream scenarios cannot use calibration — fix the @calibrate scenarios and re-run.',
    );
  }

  writeCalibrationResult(
    maxTotalMs,
    maxStepMs,
    maxLaunchStepMs,
    maxWaitStepMs,
    maxElementStepMs,
  );

  console.log(
    `[Cal] stored: S=${maxStepMs}ms L=${maxLaunchStepMs}ms W=${maxWaitStepMs}ms E=${maxElementStepMs}ms`,
  );
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
