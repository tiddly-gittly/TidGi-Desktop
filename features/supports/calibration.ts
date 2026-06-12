import fs from 'fs';
import path from 'path';

/**
 * E2E performance calibration — every timeout value comes from measurement.
 *
 * Preflight runs smoke test 4×, extracts per-step durations from cucumber JSON,
 * classifies by operation type. Timeouts are set to the measured worst case
 * for each type. No hardcoded timeout values anywhere.
 */

const CALIBRATION_FILE = path.resolve(process.cwd(), '.calibration.json');

type CalibrationRecord = {
  /** Total wall-clock budget from calibration runs, kept for diagnostics. */
  totalMs: number;
  /** Step timeout budget derived from measured calibration runs. */
  stepMs: number;
  /** Launch/browser-view timeout budget derived from measured calibration runs. */
  launchMs: number;
  /** Wait/log/SSE/watch-fs budget, measured for future per-category timeout. */
  waitMs: number;
  /** Click/type/check timeout budget derived from measured calibration runs. */
  elementMs: number;
  observed?: {
    totalMs: number;
    stepMs: number;
    launchMs: number;
    waitMs: number;
    elementMs: number;
  };
  sampleCount?: number;
  recordedAt: number;
};

type CalibrationWriteInput = Omit<CalibrationRecord, 'recordedAt'>;

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
      observed: parsed.observed,
      sampleCount: parsed.sampleCount,
      recordedAt: typeof parsed.recordedAt === 'number' ? parsed.recordedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeCalibrationResult(result: CalibrationWriteInput): void {
  fs.mkdirSync(path.dirname(CALIBRATION_FILE), { recursive: true });
  fs.writeFileSync(
    CALIBRATION_FILE,
    JSON.stringify(
      {
        ...result,
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
    [
      'E2E calibration file (.calibration.json) is missing.',
      '',
      'Run calibration FIRST (once per machine / after timeout-related changes):',
      '  pnpm run test:e2e:calibrate',
      '',
      'Then run targeted E2E tests, for example:',
      '  pnpm test:e2e --tags="@edit-workspace-save-http-api"',
      '',
      'AI agents: do NOT assume `pnpm test:e2e` generates calibration — it only runs scenarios.',
      'If this error appears, run `pnpm run test:e2e:calibrate` before retrying E2E.',
    ].join('\n'),
  );
}

export function getMeasuredStepTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return NO_TIMEOUT;
  return requireRecord().stepMs;
}

export function getMeasuredLaunchTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return NO_TIMEOUT;
  return requireRecord().launchMs;
}

export function getMeasuredElementTimeoutMs(): number {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') return NO_TIMEOUT;
  return requireRecord().elementMs;
}
