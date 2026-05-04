import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { writeCalibrationResult } from '../features/supports/calibration';

function runSmokeCalibration(): void {
  const CALIBRATION_RUNS = 2;
  const outputFile = path.resolve(process.cwd(), 'test-artifacts', '.calibration-raw.json');

  let maxTotalMs = 0;
  let maxStepMs = 0;

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
    const stepMs = extractMaxStepDuration(outputFile);

    console.log(`[Calibration] run ${runIndex + 1}/${CALIBRATION_RUNS}: total=${totalMs}ms maxStep=${stepMs}ms`);

    if (totalMs > maxTotalMs) maxTotalMs = totalMs;
    if (stepMs > maxStepMs) maxStepMs = stepMs;
  }

  writeCalibrationResult(maxTotalMs, maxStepMs);

  console.log(`[Calibration] stored: maxStep=${maxStepMs}ms total=${maxTotalMs}ms`);
}

function extractMaxStepDuration(jsonFilePath: string): number {
  try {
    const report = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8')) as Array<Record<string, unknown>>;
    let maxMs = 0;

    for (const feature of report) {
      for (const element of (feature.elements ?? []) as Array<Record<string, unknown>>) {
        for (const step of (element.steps ?? []) as Array<Record<string, unknown>>) {
          if (step.result?.duration) {
            const ms = (step.result.duration as number) / 1_000_000;
            if (ms > maxMs) maxMs = ms;
          }
        }
      }
    }

    return Math.ceil(maxMs);
  } catch {
    console.warn('[Calibration] Failed to parse JSON output');
    return 0;
  }
}

runSmokeCalibration();
