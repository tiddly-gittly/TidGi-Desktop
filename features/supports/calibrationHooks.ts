/**
 * Cucumber hooks for automatic E2E performance calibration.
 *
 * The @smoke scenario is used as a calibration test. When it runs,
 * we measure its duration and use that to calculate the performance
 * multiplier for all subsequent tests.
 */

import { After, Before } from '@cucumber/cucumber';
import { setCalibrationResult } from './calibration';

let smokeStartTime: number | null = null;

/**
 * Before @smoke scenario: record start time
 */
Before({ tags: '@smoke' }, function() {
  smokeStartTime = Date.now();
});

/**
 * After @smoke scenario: calculate duration and set calibration
 */
After({ tags: '@smoke' }, function() {
  if (smokeStartTime !== null) {
    const duration = Date.now() - smokeStartTime;
    setCalibrationResult(duration);
    smokeStartTime = null;
  }
});
