#!/usr/bin/env tsx
/**
 * E2E argument validator + cucumber-js launcher.
 *
 * Background: npm/pnpm append extra args ONLY to the last command in the
 * `&&` chain. This script is placed as the final command so it receives
 * all cucumber args, validates them, and then spawns cucumber-js.
 *
 * Common misuse patterns caught:
 * - pnpm test:e2e -- --tags=@smoke  (extra `--` leaks through)
 * - pnpm test:e2e --tags=smoke      (missing @ prefix)
 * - Unknown --options that cucumber won't understand
 */

import { spawnSync } from 'child_process';
import path from 'path';

const cucumberArguments = process.argv.slice(2);

// ── Validation phase ──
validateArguments(cucumberArguments);

// ── Execution phase ──
const cucumberBin = path.resolve(process.cwd(), 'node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');
const result = spawnSync(process.execPath, [cucumberBin, '--config', 'features/cucumber.config.js', '--exit', ...cucumberArguments], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env,
});

process.exit(result.status ?? 1);

// ── Validators ──

function validateArgs(args: string[]): void {
  if (args.length === 0) return; // Running all tests is intentional

  // Pattern 1: Literal `--` passed as a cucumber arg.
  // Someone wrote `pnpm test:e2e -- --tags=@smoke` and the `--` leaked through.
  if (args.includes('--')) {
    fail(
      'Literal "--" in cucumber arguments',
      'You may have used:',
      '  pnpm test:e2e -- --tags=@smoke',
      '',
      'Correct syntax (no extra "--"):',
      '  pnpm test:e2e --tags=@smoke',
      '',
      'See docs/TestingE2E.md for full usage.',
    );
  }

  // Pattern 2: --tags with invalid format
  // HACK for 'tsx' + '--' interaction: If you call
  //   pnpm test:e2e --tags="@smoke or @preference"
  // pnpm transforms the '--tags=...' into '--tags ...' and, together
  // with cross-env, injects  '--tags' and '@smoke or @preference' as two
  // separate argv entries. Detect that and accept the pair.
  for (let index = 0; index < arguments_.length; index++) {
    if (arguments_[index] === '--tags' && index + 1 < arguments_.length) {
      // cross-env deconstructed --tags=VALUE into two args. The next arg
      // is the value; skip the value check for the standalone flag.
      index += 1; // skip value
      continue;
    }
    if (arguments_[index].startsWith('--tags=')) {
      const tagValue = arguments_[index].slice('--tags='.length);
      if (tagValue.length > 0 && !tagValue.startsWith('@') && !tagValue.startsWith('not ')) {
        fail(
          `Invalid tag expression "${tagValue}"`,
          'Cucumber tags must start with "@". Examples:',
          '  --tags=@smoke',
          '  --tags="@smoke or @preference"',
          '  --tags="not @slow"',
        );
      }
    }
  }

  // Pattern 3: Unknown --options
  const knownPrefixes = [
    '--tags', '--tags=',
    '--profile', '--profile=',
    '--format', '--format=',
    '--parallel', '--parallel=',
    '--retry', '--retry=',
    '--name', '--name=',
    '--language', '--language=',
    '--require', '--require=',
    '--world-parameters', '--world-parameters=',
    '--exit', '--fail-fast', '--dry-run', '--strict',
    '--no-strict', '--publish', '--publish-quiet',
  ];

  for (const argument of arguments_) {
    if (argument.startsWith('--') && !knownPrefixes.some((prefix) => argument.startsWith(prefix))) {
      fail(
        `Unknown cucumber option "${argument}"`,
        'Supported options:',
        '  --tags=@name       Run scenarios with this tag',
        '  --profile=name     Use a specific cucumber profile',
        'See docs/TestingE2E.md for examples.',
      );
    }
  }
}

function fail(title: string, ...lines: string[]): never {
  const border = '═'.repeat(60);
  const guide = 'docs/TestingE2E.md';
  console.error(`\n╔${border}╗`);
  console.error(`║  E2E ARGS ERROR: ${title.padEnd(44)}║`);
  console.error(`╠${border}╣`);
  for (const line of lines) {
    console.error(`║  ${line.padEnd(56)}║`);
  }
  console.error(`╠${border}╣`);
  console.error(`║  Read the E2E testing guide before re-running:             ║`);
  console.error(`║    cat ${guide.padEnd(50)}║`);
  console.error(`╚${border}╝\n`);
  process.exit(1);
}
