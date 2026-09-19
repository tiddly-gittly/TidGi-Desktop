import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronPath = require('electron') as string;
const vitestPath = path.join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs');
const largeSuite = 'src/services/agentInstance/__tests__/conversationPaging.integration.test.ts';
const resourceHeavySuites = [
  'src/services/agentInstance/__tests__/multiTurnToolUse.test.ts',
  'scripts/__tests__/compilePlugins.test.ts',
  'src/pages/Agent/adapters/components/__tests__/WikiTiddlerSelector.test.tsx',
  'src/services/git/__tests__/gitScopedOperations.test.ts',
  'src/pages/Agent/adapters/components/PromptPreviewDialog/__tests__/PromptPreviewDialog.ui.test.tsx',
  'src/pages/Main/__tests__/index.test.tsx',
];
const standardShardCount = 8;
const dedicatedSuites = new Set([largeSuite, ...resourceHeavySuites]);
const standardSuites = discoverTestSuites()
  .filter(file => !dedicatedSuites.has(file));
const standardShards: string[][] = Array.from({ length: standardShardCount }, () => []);
for (const [index, file] of standardSuites.entries()) {
  standardShards[index % standardShardCount].push(file);
}

// These suites import most of the renderer, Git, plugin compiler, or agent
// runtime graphs. Run that known bounded set first in one fresh coordinator
// instead of letting a hash-based shard accidentally combine it with dozens
// of unrelated transforms at the end of a memory-constrained CI job.
runVitest(['run', ...resourceHeavySuites]);

// This fixture materializes and merges 100k messages. Keep it in the unit
// gate, but give it a fresh process so its native SQLite/V8 state cannot make
// an otherwise successful shared worker spend minutes in exit-time GC.
runVitest(['run', largeSuite, '--maxWorkers', '1']);

for (const shard of standardShards) {
  if (shard.length > 0) runVitest(['run', ...shard]);
}

function discoverTestSuites(): string[] {
  const files: string[] = [];
  for (const root of ['src', 'features', 'scripts']) {
    visit(path.join(projectRoot, root), root === 'scripts');
  }
  return files.sort();

  function visit(directory: string, requireTestsDirectory: boolean): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath, requireTestsDirectory);
        continue;
      }
      if (!entry.isFile() || !/\.(?:test|spec)\.(?:ts|tsx|js)$/.test(entry.name)) continue;
      const relativePath = path.relative(projectRoot, absolutePath).split(path.sep).join('/');
      if (requireTestsDirectory && !relativePath.includes('/__tests__/')) continue;
      files.push(relativePath);
    }
  }
}

function runVitest(arguments_: string[]): void {
  const result = spawnSync(
    electronPath,
    [vitestPath, ...arguments_],
    {
      cwd: projectRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status === 0) return;
  if (result.signal) {
    console.error(`Vitest process terminated by ${result.signal}`);
  }
  process.exit(result.status ?? 1);
}
