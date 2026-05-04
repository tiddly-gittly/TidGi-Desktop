import fs from 'fs';
import path from 'path';

/**
 * E2E performance calibration to determine dynamic timeout multiplier.
 *
 * How it works:
 * 1. `pnpm test:e2e` runs calibration preflight (error-to-error-preflight.ts) first
 * 2. Preflight runs the smoke test (with filesystem watch) and measures total time
 * 3. Multiplier = measured_ms / REFERENCE_CALIBRATION_MS
 * 4. Main test: step_timeout = BASE_STEP_TIMEOUT_MS × multiplier
 *
 * On baseline CI (~20s calibration): multiplier ≈ 1.0 → timeout ≈ 60s per step
 * On slow CI (~30s calibration): multiplier ≈ 1.5 → timeout ≈ 90s per step
 */

/**
 * Baseline calibration time on reference GitHub Actions CI.
 * Measured empirically: smoke test (16 steps + app launch + filesystem watch) ≈ 20s.
 * This is the "1×" reference point. All timeout calculations scale from this.
 */
const REFERENCE_CALIBRATION_MS = 20000; // ~20s on baseline CI

/**
 * Minimum step timeout budget on the reference (1×) machine.
 * Heavy operations (nsfw watcher init, filesystem watch enable) need ~60s.
 * Lighter machines get proportionally more time via the calibration multiplier.
 */
const BASE_STEP_TIMEOUT_MS = 60000; // 60s per step on baseline machine

/**
 * Multiplier used during calibration preflight only.
 * First Electron launch is significantly slower than subsequent ones,
 * so the measurement itself needs generous time to complete.
 * This is NOT a safety cap for regular tests - if calibration is missing,
 * tests will fail with a clear error.
 */
const CALIBRATION_PREFLIGHT_MULTIPLIER = 10.0; // 600s timeout for calibration smoke test

const CALIBRATION_FILE = path.resolve(process.cwd(), 'test-artifacts', '.calibration.json');

type CalibrationRecord = {
  measuredMs: number;
  multiplier: number;
  recordedAt: number;
};

let cachedMultiplier: number | null = null;

function readCalibrationRecord(): CalibrationRecord | null {
  try {
    if (!fs.existsSync(CALIBRATION_FILE)) {
      return null;
    }

    const parsed = JSON.parse(fs.readFileSync(CALIBRATION_FILE, 'utf-8')) as Partial<CalibrationRecord>;
    if (typeof parsed.multiplier !== 'number' || typeof parsed.measuredMs !== 'number') {
      return null;
    }

    return {
      measuredMs: parsed.measuredMs,
      multiplier: parsed.multiplier,
      recordedAt: typeof parsed.recordedAt === 'number' ? parsed.recordedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeCalibrationResult(actualDurationMs: number): number {
  const multiplier = actualDurationMs / REFERENCE_CALIBRATION_MS;

  fs.mkdirSync(path.dirname(CALIBRATION_FILE), { recursive: true });
  fs.writeFileSync(
    CALIBRATION_FILE,
    JSON.stringify(
      {
        measuredMs: actualDurationMs,
        multiplier,
        recordedAt: Date.now(),
      } satisfies CalibrationRecord,
      null,
      2,
    ),
    'utf-8',
  );

  return multiplier;
}

export function setCalibrationResult(actualDurationMs: number): void {
  cachedMultiplier = writeCalibrationResult(actualDurationMs);
}

/**
 * Get the performance multiplier for timeout scaling.
 *
 * During calibration preflight (TIDGI_E2E_IS_CALIBRATION=true):
 *   Uses conservative multiplier so the measurement can complete.
 *
 * During regular test run:
 *   Reads the calibration file written by the preflight.
 *   If no calibration file exists → throws, because something is wrong
 *   (the preflight should always run before the main test in `test:e2e`).
 */
export function getPerformanceMultiplier(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') {
    return CALIBRATION_PREFLIGHT_MULTIPLIER;
  }

  if (cachedMultiplier !== null) {
    return cachedMultiplier;
  }

  const record = readCalibrationRecord();
  if (record) {
    cachedMultiplier = record.multiplier;
    return cachedMultiplier;
  }

  throw new Error(
    'E2E calibration file is missing. ' +
      'Always run `pnpm test:e2e` which includes calibration preflight. ' +
      'If running cucumber directly, first run `pnpm test:e2e:calibration` or set TIDGI_E2E_IS_CALIBRATION=true.',
  );
}

/**
 * Check if calibration has been performed.
 */
export function isCalibrated(): boolean {
  return cachedMultiplier !== null || readCalibrationRecord() !== null;
}

/**
 * The base step timeout for 1× multiplier (reference machine performance).
 * Used by timeouts.ts to calculate actual timeouts.
 */
export { BASE_STEP_TIMEOUT_MS };
