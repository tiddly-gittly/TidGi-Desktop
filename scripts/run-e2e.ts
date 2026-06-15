#!/usr/bin/env tsx
/**
 * Single entry point for `pnpm test:e2e`.
 *
 * All cucumber args are forwarded here by pnpm (no `&&` chain), then validated
 * with strict rules before cucumber-js runs. Direct cucumber-js invocation
 * bypasses this gate — always use `pnpm test:e2e`.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  E2EArgsValidationError,
  formatE2EArgsValidationError,
  validateCucumberArguments,
} from './validate-cucumber-arguments';

const CALIBRATION_FILE = path.resolve(process.cwd(), '.calibration.json');
const cucumberArguments: string[] = process.argv.slice(2);

process.env.NODE_ENV = 'test';

try {
  validateCucumberArguments(cucumberArguments);
} catch (error_) {
  if (error_ instanceof E2EArgsValidationError) {
    console.error(formatE2EArgsValidationError(error_));
    process.exit(1);
  }
  throw error_;
}

ensureCalibrationFileExists();
prepareTestDirectories();

const exitCode = runCucumber(cucumberArguments);
process.exit(exitCode);

function prepareTestDirectories(): void {
  fs.rmSync(path.resolve(process.cwd(), 'test-artifacts'), { recursive: true, force: true });
  // developmentMkdir.ts is a no-op when NODE_ENV=test (see that script).
}

function ensureCalibrationFileExists(): void {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') {
    return;
  }

  if (fs.existsSync(CALIBRATION_FILE)) {
    return;
  }

  console.error(formatE2EArgsValidationError(new E2EArgsValidationError(
    'Missing .calibration.json',
    [
      'E2E timeouts are measured — they are not hardcoded.',
      '',
      'Run calibration FIRST:',
      '  pnpm run test:e2e:calibrate',
      '',
      'Then run your scenarios, for example:',
      '  pnpm test:e2e --tags="@edit-workspace-save-http-api"',
      '',
      'AI agents: `pnpm test:e2e` does NOT run calibration.',
    ],
  )));
  process.exit(1);
}

function runCucumber(arguments_: string[]): number {
  const cucumberBin = path.resolve(process.cwd(), 'node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');
  const result = spawnSync(process.execPath, [cucumberBin, '--config', 'features/cucumber.config.js', '--exit', ...arguments_], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
  return result.status ?? 1;
}
