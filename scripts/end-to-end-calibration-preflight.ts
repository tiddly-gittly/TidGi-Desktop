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
  let maxElementStepMs = 0;

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
    maxStepMs = Math.max(maxStepMs, maxLaunchStepMs + maxWaitStepMs + maxElementStepMs);

    console.log(`[Cal] #${runIndex + 1}/${CALIBRATION_RUNS}: T=${totalMs} S=${maxStepMs} L=${maxLaunchStepMs} W=${maxWaitStepMs} E=${maxElementStepMs}`);
  }

  // If all runs failed, use safe conservative defaults instead of zeroes.
  // Zeroes cause every Cucumber step to time out immediately.
  if (maxTotalMs === 0) {
    console.warn('[Cal] all runs failed — using conservative fallback timeouts');
    maxTotalMs = 120_000;
    maxStepMs = 120_000;
    maxLaunchStepMs = 60_000;
    maxWaitStepMs = 30_000;
    maxElementStepMs = 10_000;
  }

  writeCalibrationResult(maxTotalMs, maxStepMs, maxLaunchStepMs, maxWaitStepMs, maxElementStepMs);

  console.log(`[Cal] stored: S=${maxStepMs}ms L=${maxLaunchStepMs}ms W=${maxWaitStepMs}ms E=${maxElementStepMs}ms`);
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

function isWaitStep(name: string): boolean {
  return /wait for|log entries|SSE|watch-fs/i.test(name);
}

function isElementStep(name: string): boolean {
  return /click|type|check/i.test(name);
}

runSmokeCalibration();
