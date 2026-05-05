import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { writeCalibrationResult } from '../features/supports/calibration';

interface StepTiming {
  name: string;
  durationMs: number;
}

function runSmokeCalibration(): void {
  const CALIBRATION_RUNS = 4; // more runs = more launch samples to capture timing variance
  const outputFile = path.resolve(process.cwd(), 'test-artifacts', '.calibration-raw.json');

  let maxTotalMs = 0;
  let maxStepMs = 0;
  let maxLaunchStepMs = 0;
  let maxWaitStepMs = 0;

  for (let runIndex = 0; runIndex < CALIBRATION_RUNS; runIndex++) {
    const startedAt = Date.now();

    execSync(
      `cross-env NODE_ENV=test cucumber-js --config features/cucumber.config.js --profile calibration --format json:${outputFile} --exit`,
      {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test', TIDGI_E2E_IS_CALIBRATION: 'true' },
      },
    );

    const totalMs = Date.now() - startedAt;
    const steps = extractStepTimings(outputFile);

    if (totalMs > maxTotalMs) maxTotalMs = totalMs;

    for (const step of steps) {
      if (step.durationMs > maxStepMs) maxStepMs = step.durationMs;

      // Classify by step type for operation-specific timeouts
      if (isLaunchStep(step.name) && step.durationMs > maxLaunchStepMs) {
        maxLaunchStepMs = step.durationMs;
      }
      if (isWaitStep(step.name) && step.durationMs > maxWaitStepMs) {
        maxWaitStepMs = step.durationMs;
      }
    }

    console.log(`[Calibration] run ${runIndex + 1}/${CALIBRATION_RUNS}: total=${totalMs}ms allMax=${maxStepMs}ms launchMax=${maxLaunchStepMs}ms waitMax=${maxWaitStepMs}ms`);
  }

  writeCalibrationResult(maxTotalMs, maxStepMs, maxLaunchStepMs, maxWaitStepMs);

  console.log(`[Calibration] stored: step=${maxStepMs}ms launch=${maxLaunchStepMs}ms wait=${maxWaitStepMs}ms`);
}

function extractStepTimings(jsonFilePath: string): StepTiming[] {
  try {
    const report = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8')) as Array<Record<string, unknown>>;
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

function isLaunchStep(name: string): boolean {
  return /launch|page to load|browser view.*loaded/i.test(name);
}

function isWaitStep(name: string): boolean {
  return /wait for|log entries|SSE|watch-fs/i.test(name);
}

runSmokeCalibration();
