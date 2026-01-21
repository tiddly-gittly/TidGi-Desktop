// pnpm exec cross-env NODE_ENV=test tsx ./scripts/start-e2e-app.ts
// or: pnpm exec cross-env NODE_ENV=test tsx ./scripts/start-e2e-app.ts "Configure root tiddler and verify content loads after restar"
/* eslint-disable unicorn/prevent-abbreviations */
import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { getPackedAppPath } from '../features/supports/paths';

// You can also use `pnpm dlx tsx scripts/startMockOpenAI.ts`

/**
 * Get the most recent test scenario directory from test-artifacts
 */
function getMostRecentScenarioName(): string | undefined {
  const testArtifactsDir = path.resolve(process.cwd(), 'test-artifacts');

  if (!fs.existsSync(testArtifactsDir)) {
    return undefined;
  }

  try {
    const entries = fs.readdirSync(testArtifactsDir, { withFileTypes: true });
    const scenarioDirs = entries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        time: fs.statSync(path.join(testArtifactsDir, entry.name)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    return scenarioDirs[0]?.name;
  } catch (error) {
    console.warn('Failed to get most recent scenario:', error);
    return undefined;
  }
}

const appPath = getPackedAppPath();

// Get scenario name from command line argument or detect most recent
const scenarioName = process.argv[2] || getMostRecentScenarioName();

if (scenarioName) {
  console.log('Starting TidGi E2E app with scenario:', scenarioName);
} else {
  console.log('Starting TidGi E2E app without scenario (using legacy userData-test)');
}
console.log('App path:', appPath);

const environment = Object.assign({}, process.env, {
  NODE_ENV: 'test',
  LANG: process.env.LANG || 'zh-Hans.UTF-8',
  LANGUAGE: process.env.LANGUAGE || 'zh-Hans:zh',
  LC_ALL: process.env.LC_ALL || 'zh-Hans.UTF-8',
});

// Pass scenario name as argument to the app if available
const args = scenarioName ? [`--test-scenario=${scenarioName}`] : [];

const child = spawn(appPath, args, { env: environment, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 0));
child.on('error', error => {
  console.error('Failed to start TidGi app:', error);
  process.exit(1);
});
