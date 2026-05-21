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

  let maxLaunchStepMs = 0;

  for (let runIndex = 0; runIndex < CALIBRATION_RUNS; runIndex++) {
    const startedAt = Date.now();
    let success = false;

    try {
      execSync(
        `cross-env NODE_ENV=test cucumber-js --config features/cucumber.config.js --profile calibration --format json:${outputFile} --exit`,
        {
          stdio: 'inherit',
          cwd: process.cwd(),
          env: { ...process.env, NODE_ENV: 'test', TIDGI_E2E_IS_CALIBRATION: 'true' },
        },
      );
      success = true;
    } catch {
      console.warn(`[Calibration] run ${runIndex + 1}/${CALIBRATION_RUNS} failed, skipping results`);
    }

    if (!success) continue;

    const totalMs = Date.now() - startedAt;
    const steps = extractStepTimings(outputFile);

    for (const step of steps) {
      if (isLaunchStep(step.name) && step.durationMs > maxLaunchStepMs) {
        maxLaunchStepMs = step.durationMs;
      }
    }

    console.log(`[Cal] #${runIndex + 1}/${CALIBRATION_RUNS}: T=${totalMs} L=${maxLaunchStepMs}ms`);
  }

  if (maxLaunchStepMs === 0) {
    console.warn('[Cal] all runs failed — using conservative fallback timeouts');
    maxLaunchStepMs = 60_000;
  }

  writeCalibrationResult(maxLaunchStepMs);

  console.log(`[Cal] stored: step timeout = ${maxLaunchStepMs}ms`);
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

function isLaunchStep(name: string): boolean {
  return /launch|page to load|browser view.*loaded/i.test(name);
}

runSmokeCalibration();
