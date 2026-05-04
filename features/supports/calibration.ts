import fs from 'fs';
import path from 'path';

/**
 * E2E performance calibration — every value comes from measurement.
 *
 * Flow:
 * 1. Preflight runs smoke test (light clicks + filesystem watch) with JSON formatter
 * 2. Parses JSON to find max individual step duration (real worst case)
 * 3. Main test uses that measured max as per-step timeout
 *
 * No multipliers, no caps, no floors. The measurement IS the timeout.
 */

const CALIBRATION_FILE = path.resolve(process.cwd(), 'test-artifacts', '.calibration.json');

type CalibrationRecord = {
  /** Total smoke test wall-clock time (ms) */
  totalMs: number;
  /** Longest individual step measured during smoke test (ms) */
  maxStepMs: number;
  recordedAt: number;
};

let cachedRecord: CalibrationRecord | null = null;

function readCalibrationRecord(): CalibrationRecord | null {
  try {
    if (!fs.existsSync(CALIBRATION_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(CALIBRATION_FILE, 'utf-8')) as Partial<CalibrationRecord>;
    if (typeof parsed.maxStepMs !== 'number' || typeof parsed.totalMs !== 'number') return null;
    return {
      totalMs: parsed.totalMs,
      maxStepMs: parsed.maxStepMs,
      recordedAt: typeof parsed.recordedAt === 'number' ? parsed.recordedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeCalibrationResult(totalMs: number, maxStepMs: number): void {
  fs.mkdirSync(path.dirname(CALIBRATION_FILE), { recursive: true });
  fs.writeFileSync(
    CALIBRATION_FILE,
    JSON.stringify(
      {
        totalMs,
        maxStepMs,
        recordedAt: Date.now(),
      } satisfies CalibrationRecord,
      null,
      2,
    ),
    'utf-8',
  );
}

/**
 * The measured worst-case step duration from calibration.
 * This becomes the cucumber per-step timeout for heavy operations.
 * Light operations (click/type/find) use fixed short timeouts instead.
 */
export function getMeasuredStepTimeoutMs(): number {
  // During calibration preflight, use a huge timeout so measurement can complete
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') {
    return 3_600_000; // 1 hour — purely to let the measurement finish
  }

  if (cachedRecord !== null) return cachedRecord.maxStepMs;

  const record = readCalibrationRecord();
  if (record) {
    cachedRecord = record;
    return record.maxStepMs;
  }

  throw new Error(
    'E2E calibration file is missing. Run `pnpm test:e2e` which includes the calibration preflight.',
  );
}
