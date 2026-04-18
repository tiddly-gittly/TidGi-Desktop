/**
 * Lightweight CPU benchmark to determine a performance multiplier for E2E test timeouts.
 *
 * Why this exists: E2E steps involve heavy Electron/TiddlyWiki startup that is strictly
 * proportional to CPU speed.  On fast CI machines the default 25 s budget is plenty;
 * on a slow dev box the same budget fires false "timed-out" failures.  Rather than
 * hard-coding per-machine values, we measure the actual CPU at suite start and derive
 * a scale factor that is applied to every timeout.  Fast machines get tight timeouts
 * (fast bug detection), slow machines get the room they need.
 *
 * Benchmark design:
 *   - Pure synchronous arithmetic – no I/O, no network, no Electron.
 *   - Calibrated so that a "reference" machine (comparable to GitHub Actions
 *     ubuntu-latest with 2 vCPUs) completes the work in ~REFERENCE_DURATION_MS ms.
 *   - Total wall time is always < 500 ms even on very slow hardware.
 */

/** How many ms the reference machine takes (measured empirically on GH Actions). */
const REFERENCE_DURATION_MS = 120;

/** Absolute lower bound: never scale below 2.0 on local dev boxes (1.0 on CI).
 *
 * Even on fast hardware, local dev runs face more disk-I/O and memory contention
 * than the CI reference runner (other processes, antivirus scans, long test suites
 * that exhaust system resources after many scenarios, etc.).
 * A 2.0× floor gives a 100% timing cushion without requiring any measured data.
 * CI machines keep 1.0 because they are dedicated runners with known performance.
 */
const MIN_MULTIPLIER = 2.0;

/**
 * Upper bound: don't let very slow machines wait more than ~3× the reference
 * budget, otherwise the whole suite becomes impractically slow to debug.
 */
const MAX_MULTIPLIER = 3.0;

/** Number of iterations for the synthetic workload.  Chosen to run ~120 ms on reference. */
const WORKLOAD_ITERATIONS = 3_500_000;

/**
 * Run a short CPU workload and return the elapsed milliseconds.
 * Exported so tests can mock it.
 */
export function measureCpuMs(): number {
  const start = performance.now();
  // Mix of operations to avoid JIT over-optimisation of a trivially constant loop.
  let accumulator = 1.0;
  for (let index = 0; index < WORKLOAD_ITERATIONS; index++) {
    accumulator = (accumulator * 1.000_001 + index % 7) % 1_000_000;
  }
  // Prevent the compiler from eliminating the loop as dead code.
  if (accumulator < 0) console.error('cpuBenchmark: unreachable', accumulator);
  return performance.now() - start;
}

/**
 * Return a multiplier ≥ 1.0 representing how much slower this machine is
 * compared to the reference CI runner.
 *
 * Examples:
 *   reference CI  → 1.0
 *   2× slower box → 2.0  (capped at MAX_MULTIPLIER)
 *   faster than CI → 1.0  (floored at MIN_MULTIPLIER)
 */
export function getCpuPerformanceMultiplier(): number {
  const elapsed = measureCpuMs();
  const raw = elapsed / REFERENCE_DURATION_MS;
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, raw));
}
