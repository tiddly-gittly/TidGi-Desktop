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
  /** Total wall-clock time of slowest calibration run → CUCUMBER_GLOBAL_TIMEOUT */
  totalMs: number;
  /** Max of ALL individual steps across all runs — fallback when per-type measurements are missing. */
  stepMs: number;
  /** Max of launch/browser-view steps → HEAVY_PLAYWRIGHT_TIMEOUT */
  launchMs: number;
  /** Max of wait/log/SSE/watch-fs steps — measured, reserved for future per-category timeout. */
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

// During calibration preflight, use a generous timeout that is safe for Node.js setTimeout
// AND Playwright Chromium CDP. Node.js 32-bit signed max is 2^31-1 (2147483647 ≈ 24.8d),
// but Playwright CDP may overflow values above 2^30. 5 minutes is safe and enough.
const NO_TIMEOUT = 300_000;

function requireRecord(): CalibrationRecord {
  if (cachedRecord !== null) return cachedRecord;
  const record = readCalibrationRecord();
  if (record) {
    cachedRecord = record;
    return record;
  }
  throw new Error(
    'E2E calibration file is missing.\nRun `pnpm test:e2e` to generate it — the calibration preflight runs automatically.',
  );
}

export function getMeasuredStepTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return NO_TIMEOUT;
  return requireRecord().totalMs;
}

export function getMeasuredLaunchTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return NO_TIMEOUT;
  return requireRecord().launchMs;
}

export function getMeasuredElementTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return NO_TIMEOUT;
  return requireRecord().elementMs;
}
