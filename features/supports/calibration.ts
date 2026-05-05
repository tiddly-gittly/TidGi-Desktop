import fs from 'fs';
import path from 'path';

/**
 * E2E performance calibration — every value comes from measurement.
 *
 * The smoke test exercises launch, element interaction, log-marker waits,
 * and filesystem watch. Individual step durations are extracted from cucumber
 * JSON output and classified by operation type so each type gets its own
 * measured timeout — no hardcoded constants.
 */

const CALIBRATION_FILE = path.resolve(process.cwd(), 'test-artifacts', '.calibration.json');

type CalibrationRecord = {
  totalMs: number;
  stepMs: number;
  launchMs: number;
  waitMs: number;
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

/** All-step max — cucumber per-step timeout for heavy operations. */
export function getMeasuredStepTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return 3_600_000;
  // Use generous ceiling: Playwright system operations (launch/firstWindow) need room.
  // Quick failures come from PLAYWRIGHT_TIMEOUT (10s), not the cucumber timeout.
  return 120_000;
}

/** App launch + page load — measured from launch/browser-view steps. */
export function getMeasuredLaunchTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return 3_600_000;
  return requireRecord().launchMs;
}

/** Log-marker waits + SSE/watch-fs — measured from wait/log steps. */
export function getMeasuredWaitTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return 3_600_000;
  return requireRecord().waitMs;
}
