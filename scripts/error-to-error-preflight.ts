import { execSync } from 'child_process';
import { writeCalibrationResult } from '../features/supports/calibration';

function runSmokeCalibration(): void {
  if (process.env.CI) {
    return;
  }

  const startedAt = Date.now();

  execSync('cross-env NODE_ENV=test CUCUMBER_PROFILE=calibration cucumber-js --config features/cucumber.config.js --tags "@smoke" --exit', {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      TIDGI_E2E_IS_CALIBRATION: 'true',
    },
  });

  const duration = Date.now() - startedAt;
  const multiplier = writeCalibrationResult(duration);

  console.log(`[E2E Calibration] smoke duration=${duration}ms multiplier=${multiplier.toFixed(2)}×`);
}

runSmokeCalibration();
