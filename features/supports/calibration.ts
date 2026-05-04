import fs from 'fs';
import path from 'path';

/**
 * E2E performance calibration to determine dynamic timeout multiplier.
 *
 * Why this exists: E2E tests involve CPU, I/O, Electron startup, and rendering.
 * A pure CPU benchmark doesn't capture the full performance picture. Instead,
 * each `pnpm test:e2e` run first measures a representative smoke scenario and
 * writes the result to a temporary calibration file. The main E2E run then
 * reads that file before loading timeout constants.
 *
 * The smoke test includes filesystem watch enable/wait to measure the worst-case
 * operation (nsfw watcher init), so the measured multiplier is representative.
 */

/** Reference duration for smoke test on GitHub Actions (measured empirically). */
const REFERENCE_SMOKE_DURATION_MS = 8000; // ~8s on CI

/**
 * Safety cap to prevent absurd multipliers from transient issues.
 * High enough that genuinely slow environments get appropriate timeouts,
 * low enough that a single outlier measurement doesn't hang tests for hours.
 */
const SAFETY_CAP = 20.0; // 20× reference = 500s max per step

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
  const raw = actualDurationMs / REFERENCE_SMOKE_DURATION_MS;
  const multiplier = Math.min(SAFETY_CAP, raw);

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

/**
 * Load calibration result that was computed before cucumber started.
 */
export function setCalibrationResult(actualDurationMs: number): void {
  cachedMultiplier = writeCalibrationResult(actualDurationMs);
}

/**
 * Get the performance multiplier for timeout scaling.
 * Returns calibrated value if smoke test has run.
 *
 * During calibration preflight (TIDGI_E2E_IS_CALIBRATION=true), uses the safety
 * cap to ensure the measurement itself can complete even on very slow machines.
 * Main test runs use the measured multiplier from the calibration file.
 */
export function getPerformanceMultiplier(): number {
  // During calibration preflight, use max timeout to ensure measurement completes
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') {
    return SAFETY_CAP;
  }

  if (cachedMultiplier !== null) {
    return cachedMultiplier;
  }

  const record = readCalibrationRecord();
  if (record) {
    cachedMultiplier = record.multiplier;
    return cachedMultiplier;
  }

  // Fallback if calibration preflight did not run (e.g., direct cucumber invocation)
  console.warn(
    `[E2E Calibration] Calibration file not found, using safety cap ${SAFETY_CAP}×`,
  );
  console.warn(
    '[E2E Calibration] Expected preflight calibration to run before cucumber startup',
  );
  return SAFETY_CAP;
}

/**
 * Check if calibration has been performed.
 */
export function isCalibrated(): boolean {
  return cachedMultiplier !== null || readCalibrationRecord() !== null;
}
