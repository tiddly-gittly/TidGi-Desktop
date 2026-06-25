#!/usr/bin/env tsx

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export class E2EArgsValidationError extends Error {
  constructor(
    public readonly title: string,
    public readonly lines: string[],
  ) {
    super(title);
    this.name = 'E2EArgsValidationError';
  }
}

const KNOWN_OPTION_PREFIXES = [
  '--tags=',
  '--profile=',
  '--format=',
  '--parallel=',
  '--retry=',
  '--name=',
  '--language=',
  '--require=',
  '--world-parameters=',
  '--exit',
  '--fail-fast',
  '--dry-run',
  '--strict',
  '--no-strict',
  '--publish',
  '--publish-quiet',
] as const;

const KNOWN_OPTIONS_WITH_VALUE = new Set([
  '--profile',
  '--format',
  '--parallel',
  '--retry',
  '--language',
  '--require',
  '--world-parameters',
]);

function isKnownOption(argument: string): boolean {
  return KNOWN_OPTION_PREFIXES.some((prefix) => argument.startsWith(prefix));
}

function validateTagValue(tagValue: string): void {
  if (tagValue.length > 0 && !tagValue.startsWith('@') && !tagValue.startsWith('not ')) {
    throw new E2EArgsValidationError(
      `Invalid tag expression "${tagValue}"`,
      [
        'Cucumber tags must start with "@". Examples:',
        '  --tags=@smoke',
        '  --tags="@smoke or @preference"',
        '  --tags="not @slow"',
      ],
    );
  }
}

export function validateCucumberArguments(arguments_: string[]): void {
  if (arguments_.length === 0) return;

  if (arguments_.includes('--')) {
    throw new E2EArgsValidationError(
      'Literal "--" in cucumber arguments',
      [
        'Do NOT insert an extra "--" before cucumber args.',
        'Wrong:',
        '  pnpm test:e2e -- --tags=@smoke',
        'Correct:',
        '  pnpm test:e2e --tags=@smoke',
        '',
        'See docs/Testing.md for full usage.',
      ],
    );
  }

  const hasTagsFilter = arguments_.some((argument) => argument === '--tags' || argument.startsWith('--tags='));
  const hasNameFilter = arguments_.some((argument) => argument === '--name' || argument.startsWith('--name='));
  if (hasTagsFilter && hasNameFilter) {
    throw new E2EArgsValidationError(
      'Do not combine --tags and --name',
      [
        'Pick ONE filter only:',
        '  pnpm test:e2e --tags="@smoke"',
        '  pnpm test:e2e --name "Scenario title"',
      ],
    );
  }

  let index = 0;
  while (index < arguments_.length) {
    const currentArgument = arguments_[index];

    if (currentArgument === '--tags') {
      throw new E2EArgsValidationError(
        'Split --tags form is not allowed',
        [
          'Tags must use combined form with "=" (no space after --tags):',
          '  pnpm test:e2e --tags="@smoke"',
          '',
          'Wrong (including `pnpm test:e2e -- --tags "@smoke"`):',
          '  pnpm test:e2e --tags "@smoke"',
        ],
      );
    }

    if (currentArgument.startsWith('--tags=')) {
      validateTagValue(currentArgument.slice('--tags='.length));
      index += 1;
      continue;
    }

    if (currentArgument === '--name') {
      if (index + 1 >= arguments_.length) {
        throw new E2EArgsValidationError(
          'Missing value for --name',
          [
            'Provide a scenario title after --name:',
            '  pnpm test:e2e --name "Wiki-search tool usage"',
          ],
        );
      }
      index += 2;
      continue;
    }

    if (currentArgument.startsWith('--name=')) {
      index += 1;
      continue;
    }

    if (currentArgument.startsWith('--')) {
      if (KNOWN_OPTIONS_WITH_VALUE.has(currentArgument)) {
        if (index + 1 >= arguments_.length || arguments_[index + 1].startsWith('--')) {
          throw new E2EArgsValidationError(
            `Missing value for ${currentArgument}`,
            [
              `Provide a value after ${currentArgument}, or use ${currentArgument}=value.`,
            ],
          );
        }
        index += 2;
        continue;
      }
      if (isKnownOption(currentArgument)) {
        index += 1;
        continue;
      }
      throw new E2EArgsValidationError(
        `Unknown cucumber option "${currentArgument}"`,
        [
          'Supported filters:',
          '  --tags=@name       Run scenarios with this tag (combined form only)',
          '  --name "title"     Run a single scenario by name',
          'See docs/TestingE2E.md for examples.',
        ],
      );
    }

    throw new E2EArgsValidationError(
      `Unexpected positional argument "${currentArgument}"`,
      [
        'E2E args must be flags only — no bare values.',
        'Tags:  pnpm test:e2e --tags="@smoke"',
        'Name:  pnpm test:e2e --name "Scenario title"',
      ],
    );
  }
}

export function formatE2EArgsValidationError(error: E2EArgsValidationError): string {
  const border = '═'.repeat(60);
  const guide = 'docs/TestingE2E.md';
  const lines = [
    `\n╔${border}╗`,
    `║  E2E ARGS ERROR: ${error.title.padEnd(44)}║`,
    `╠${border}╣`,
    ...error.lines.map((line) => `║  ${line.padEnd(56)}║`),
    `╠${border}╣`,
    `║  Read the E2E testing guide before re-running:             ║`,
    `║    cat ${guide.padEnd(50)}║`,
    `╚${border}╝\n`,
  ];
  return lines.join('\n');
}

const CALIBRATION_FILE = path.resolve(process.cwd(), '.calibration.json');

function prepareTestDirectories(): void {
  fs.rmSync(path.resolve(process.cwd(), 'test-artifacts'), { recursive: true, force: true });
}

function ensureCalibrationFileExists(): void {
  if (process.env.TIDGI_E2E_IS_CALIBRATION === 'true') {
    return;
  }

  if (fs.existsSync(CALIBRATION_FILE)) {
    return;
  }

  console.error(formatE2EArgsValidationError(
    new E2EArgsValidationError(
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
    ),
  ));
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

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return entry.replace(/\\/g, '/').endsWith('scripts/run-e2e.ts');
}

if (isDirectExecution()) {
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
  process.exit(runCucumber(cucumberArguments));
}
