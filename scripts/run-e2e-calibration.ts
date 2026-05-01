#!/usr/bin/env tsx
/**
 * Run E2E calibration smoke test to measure system performance.
 * This script runs before the full E2E suite to dynamically calculate timeout multipliers.
 */

import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

const CALIBRATION_FILE = path.resolve(process.cwd(), 'test-artifacts', '.calibration.json');

async function runCalibration() {
  console.log('[E2E Calibration] Starting calibration smoke test...');
  
  const startTime = Date.now();
  
  try {
    // Run smoke test with calibration profile
    execSync(
      'cross-env NODE_ENV=test TIDGI_E2E_IS_CALIBRATION=true cucumber-js --config features/cucumber.config.js --profile calibration --exit',
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TIDGI_E2E_IS_CALIBRATION: 'true',
        },
      }
    );
    
    const duration = Date.now() - startTime;
    console.log(`[E2E Calibration] Smoke test completed in ${duration}ms`);
    
    // Calculate multiplier
    const REFERENCE_DURATION_MS = 8000; // Reference from GitHub Actions
    const MAX_MULTIPLIER = 5.0;
    const rawMultiplier = duration / REFERENCE_DURATION_MS;
    const multiplier = Math.min(MAX_MULTIPLIER, Math.max(1.0, rawMultiplier));
    
    // Write calibration result
    await fs.ensureDir(path.dirname(CALIBRATION_FILE));
    await fs.writeJson(
      CALIBRATION_FILE,
      {
        measuredMs: duration,
        multiplier,
        recordedAt: Date.now(),
      },
      { spaces: 2 }
    );
    
    console.log(`[E2E Calibration] Performance multiplier: ${multiplier.toFixed(2)}×`);
    console.log(`[E2E Calibration] Calibration file written to: ${CALIBRATION_FILE}`);
    
    // Calculate expected timeout for workflow
    const BASE_TIMEOUT_MS = 25000;
    const SCENARIO_COUNT = 65; // Approximate, update as suite grows
    const expectedTimeoutMinutes = Math.ceil((BASE_TIMEOUT_MS * multiplier * SCENARIO_COUNT) / 60000);
    
    console.log(`[E2E Calibration] Recommended workflow timeout: ${expectedTimeoutMinutes} minutes`);
    
    return 0;
  } catch (error) {
    console.error('[E2E Calibration] Calibration failed:', error);
    console.error('[E2E Calibration] Will use fallback multiplier in main test run');
    return 1;
  }
}

runCalibration().then(code => process.exit(code));
