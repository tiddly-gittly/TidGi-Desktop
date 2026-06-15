/**
 * Cucumber argument validation for `pnpm test:e2e` (see scripts/run-e2e.ts).
 */

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
  '--profile',
  '--profile=',
  '--format',
  '--format=',
  '--parallel',
  '--parallel=',
  '--retry',
  '--retry=',
  '--name',
  '--name=',
  '--language',
  '--language=',
  '--require',
  '--require=',
  '--world-parameters',
  '--world-parameters=',
  '--exit',
  '--fail-fast',
  '--dry-run',
  '--strict',
  '--no-strict',
  '--publish',
  '--publish-quiet',
] as const;

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
