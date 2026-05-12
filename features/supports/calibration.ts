import fs from 'fs';
import path from 'path';

/**
 * E2E performance calibration — every timeout value comes from measurement.
 *
 * Preflight runs smoke test 4×, extracts per-step durations from cucumber JSON,
 * classifies by operation type. Timeouts are set to the measured worst case
 * for each type. No hardcoded timeout values anywhere.
 */

const CALIBRATION_FILE = path.resolve(process.cwd(), 'test-artifacts', '.calibration.json');

type CalibrationRecord = {
  totalMs: number;
  /** Max of ALL steps → CUCUMBER_GLOBAL_TIMEOUT */
  stepMs: number;
  /** Max of launch/browser-view steps → HEAVY_PLAYWRIGHT_TIMEOUT */
  launchMs: number;
  /** Max of wait/log/SSE/watch-fs steps → LOG_MARKER_WAIT_TIMEOUT */
  waitMs: number;
  /** Max of click/type/check steps → PLAYWRIGHT_TIMEOUT */
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
      totalMs: parsed.totalMs ?? 0,
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
  totalMs: number,
  stepMs: number,
  launchMs: number,
  waitMs: number,
  elementMs: number,
): void {
  fs.mkdirSync(path.dirname(CALIBRATION_FILE), { recursive: true });
  fs.writeFileSync(
    CALIBRATION_FILE,
    JSON.stringify(
      {
        totalMs,
        stepMs,
        launchMs,
        waitMs,
        elementMs,
        recordedAt: Date.now(),
      } satisfies CalibrationRecord,
      null,
      2,
    ),
    'utf-8',
  );
}

function requireRecord(): CalibrationRecord {
  if (cachedRecord !== null) return cachedRecord;
  const record = readCalibrationRecord();
  if (record) {
    cachedRecord = record;
    return record;
  }
  throw new Error('E2E calibration file is missing. Run `pnpm test:e2e`.');
}

// During calibration preflight, use no timeout — measurement must complete.
const NO_TIMEOUT = Number.MAX_SAFE_INTEGER;

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
