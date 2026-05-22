import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { writeCalibrationResult } from '../features/supports/calibration';

interface StepTiming {
  name: string;
  durationMs: number;
}

function runSmokeCalibration(): void {
  const CALIBRATION_RUNS = 4;
  const outputFile = path.resolve(process.cwd(), 'test-artifacts', '.calibration-raw.json');

  let maxStepMs = 0;

  for (let runIndex = 0; runIndex < CALIBRATION_RUNS; runIndex++) {
    const startedAt = Date.now();

    try {
      execSync(
        `cross-env NODE_ENV=test cucumber-js --config features/cucumber.config.js --profile calibration --format json:${outputFile} --exit`,
        {
          stdio: 'inherit',
          cwd: process.cwd(),
          env: { ...process.env, NODE_ENV: 'test', TIDGI_E2E_IS_CALIBRATION: 'true' },
        },
      );
    } catch {
      // Cucumber exits non-zero when some scenarios fail, but we can still
      // extract timing data from the passed scenarios.
    }

    const totalMs = Date.now() - startedAt;
    const steps = extractStepTimings(outputFile);
    if (steps.length === 0) {
      console.warn(`[Calibration] run ${runIndex + 1}/${CALIBRATION_RUNS} had no measurable steps, skipping`);
      continue;
    }

    for (const step of steps) {
      // Exclude steps that hit the calibration timeout ceiling — these are
      // artifacts of NO_TIMEOUT, not real step durations. A step that genuinely
      // needs 5 minutes would fail the test anyway.
      if (step.durationMs >= 290_000) continue;
      if (step.durationMs > maxStepMs) maxStepMs = step.durationMs;
    }

    console.log(`[Cal] #${runIndex + 1}/${CALIBRATION_RUNS}: T=${totalMs} S=${maxStepMs}ms`);
  }

  if (maxStepMs === 0) {
    console.error('[Cal] all calibration runs failed. Aborting — fix the app startup before running E2E.');
    process.exit(1);
  }

  writeCalibrationResult(maxStepMs);

  console.log(`[Cal] stored: step timeout = ${maxStepMs}ms`);
}

function extractStepTimings(jsonFilePath: string): StepTiming[] {
  try {
    const raw = fs.readFileSync(jsonFilePath, 'utf-8');
    const report = JSON.parse(raw) as Array<Record<string, unknown>>;
    const timings: StepTiming[] = [];

    for (const feature of report) {
      for (const element of (feature.elements ?? []) as Array<Record<string, unknown>>) {
        for (const step of (element.steps ?? []) as Array<Record<string, unknown>>) {
          const duration = step.result?.duration as number | undefined;
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

runSmokeCalibration();
