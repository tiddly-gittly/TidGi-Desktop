/**
 * E2E performance calibration to determine dynamic timeout multiplier.
 *
 * Why this exists: E2E tests involve CPU, I/O, Electron startup, and rendering.
 * A pure CPU benchmark doesn't capture the full performance picture. Instead,
 * we use the @smoke scenario as a calibration test and measure its actual
 * duration against a known baseline from CI.
 *
 * Calibration design:
 *   - @smoke scenario runs first (alphabetically or via tag ordering)
 *   - Hooks measure its duration automatically
 *   - Calculate multiplier = actual / reference
 *   - Apply this multiplier to all subsequent test timeouts
 *   - No MIN_MULTIPLIER hack - pure measurement-based scaling
 */

/** Reference duration for smoke test on GitHub Actions (measured empirically). */
const REFERENCE_SMOKE_DURATION_MS = 8000; // ~8s on CI

/**
 * Upper bound: don't let very slow machines wait more than 5× the reference
 * budget, otherwise the whole suite becomes impractically slow to debug.
 */
const MAX_MULTIPLIER = 5.0;

/**
 * Cached multiplier from smoke test run.
 */
let cachedMultiplier: number | null = null;

/**
 * Set the calibration result from the smoke test run.
 * Called automatically by calibrationHooks.ts after @smoke scenario completes.
 */
export function setCalibrationResult(actualDurationMs: number): void {
  const raw = actualDurationMs / REFERENCE_SMOKE_DURATION_MS;
  const multiplier = Math.min(MAX_MULTIPLIER, Math.max(1.0, raw));

  cachedMultiplier = multiplier;

  console.log(
    `[E2E Calibration] Smoke test took ${actualDurationMs}ms (reference: ${REFERENCE_SMOKE_DURATION_MS}ms)`,
  );
  console.log(
    `[E2E Calibration] Performance multiplier: ${multiplier.toFixed(2)}× (capped at ${MAX_MULTIPLIER}×)`,
  );
}

/**
 * Get the performance multiplier for timeout scaling.
 * Returns calibrated value if smoke test has run, otherwise returns a conservative fallback.
 */
export function getPerformanceMultiplier(): number {
  if (cachedMultiplier !== null) {
    return cachedMultiplier;
  }

  // Fallback: conservative multiplier if smoke test hasn't run yet
  // This happens when timeouts.ts is loaded before smoke test runs
  console.warn(
    '[E2E Calibration] Smoke test not yet run, using fallback multiplier 3.0×',
  );
  console.warn(
    '[E2E Calibration] Timeouts will be recalculated after @smoke scenario completes',
  );
  return 3.0;
}

/**
 * Check if calibration has been performed.
 */
export function isCalibrated(): boolean {
  return cachedMultiplier !== null;
}
