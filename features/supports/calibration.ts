import fs from 'fs';
import path from 'path';

/**
 * E2E performance calibration — every timeout comes from step measurement.
 *
 * Preflight runs smoke test 4×, measures per-step durations.
 * stepMs = the slowest individual step across all successful runs.
 */

const CALIBRATION_FILE = path.resolve(process.cwd(), 'test-artifacts', '.calibration.json');

type CalibrationRecord = {
  /** Max individual step duration across all calibration runs. */
  stepMs: number;
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
      recordedAt: typeof parsed.recordedAt === 'number' ? parsed.recordedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeCalibrationResult(stepMs: number): void {
  fs.mkdirSync(path.dirname(CALIBRATION_FILE), { recursive: true });
  fs.writeFileSync(CALIBRATION_FILE, JSON.stringify({ stepMs, recordedAt: Date.now() }, null, 2), 'utf-8');
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
