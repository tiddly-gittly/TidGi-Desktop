import { execSync } from 'child_process';
import { writeCalibrationResult } from '../features/supports/calibration';

function runSmokeCalibration(): void {
  // Run calibration multiple times to capture variance.
  // Single measurement may hit a "good" run; max of multiple runs
  // accounts for transient CI load that affects the full test suite.
  const CALIBRATION_RUNS = 2;

  let maxDuration = 0;

  for (let runIndex = 0; runIndex < CALIBRATION_RUNS; runIndex++) {
    const startedAt = Date.now();

    execSync(`cross-env NODE_ENV=test CUCUMBER_PROFILE=calibration cucumber-js --config features/cucumber.config.js --tags "@smoke" --exit`, {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        TIDGI_E2E_IS_CALIBRATION: 'true',
      },
    });

    const duration = Date.now() - startedAt;
    console.log(`[E2E Calibration] run ${runIndex + 1}/${CALIBRATION_RUNS}: ${duration}ms`);

    if (duration > maxDuration) {
      maxDuration = duration;
    }
  }

  const multiplier = writeCalibrationResult(maxDuration);

  console.log(`[E2E Calibration] max duration=${maxDuration}ms multiplier=${multiplier.toFixed(2)}×`);
}

runSmokeCalibration();
