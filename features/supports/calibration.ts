import fs from 'fs';
import path from 'path';

/**
 * E2E performance calibration — every timeout comes from step measurement.
 *
 * Preflight runs smoke test 4×, measures per-step durations across categories:
 * - launch: app startup, page load, browser view
 * - wait: log markers, SSE, watch-fs, polling
 * - element: click, type, check, select
 *
 * Step timeout = worst-case composite (launch + wait + element).
 * Each step definition uses the timeout matching its operation type.
 */

const CALIBRATION_FILE = path.resolve(process.cwd(), 'test-artifacts', '.calibration.json');

type CalibrationRecord = {
  /** Composite step timeout = max(individual, launch + wait + element). */
  stepMs: number;
  /** Max launch/browser-view step duration. */
  launchMs: number;
  /** Max wait/log-marker step duration. */
  waitMs: number;
  /** Max element-interaction step duration. */
  elementMs: number;
  recordedAt: number;
};

let cachedRecord: CalibrationRecord | null = null;

function readCalibrationRecord(): CalibrationRecord | null {
  try {
    if (!fs.existsSync(CALIBRATION_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(CALIBRATION_FILE, 'utf-8')) as Partial<CalibrationRecord>;
    if (typeof parsed.stepMs !== 'number') return null;
    return {
      stepMs: parsed.stepMs,
      launchMs: parsed.launchMs ?? parsed.stepMs,
      waitMs: parsed.waitMs ?? parsed.stepMs,
      elementMs: parsed.elementMs ?? parsed.stepMs,
      recordedAt: typeof parsed.recordedAt === 'number' ? parsed.recordedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeCalibrationResult(
  stepMs: number,
  launchMs: number,
  waitMs: number,
  elementMs: number,
): void {
  fs.mkdirSync(path.dirname(CALIBRATION_FILE), { recursive: true });
  fs.writeFileSync(
    CALIBRATION_FILE,
    JSON.stringify({ stepMs, launchMs, waitMs, elementMs, recordedAt: Date.now() }, null, 2),
    'utf-8',
  );
}

const NO_TIMEOUT = 300_000;

function requireRecord(): CalibrationRecord {
  if (cachedRecord !== null) return cachedRecord;
  const record = readCalibrationRecord();
  if (record) {
    cachedRecord = record;
    return record;
  }
  throw new Error('E2E calibration file is missing.\nRun `pnpm test:e2e` to generate it.');
}

export function getMeasuredStepTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return NO_TIMEOUT;
  return requireRecord().stepMs;
}

export function getMeasuredLaunchTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return NO_TIMEOUT;
  return requireRecord().launchMs;
}

export function getMeasuredWaitTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return NO_TIMEOUT;
  return requireRecord().waitMs;
}

export function getMeasuredElementTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return NO_TIMEOUT;
  return requireRecord().elementMs;
}
