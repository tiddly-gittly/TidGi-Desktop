// pnpm exec cross-env NODE_ENV=test tsx ./scripts/start-e2e-app.ts
/* eslint-disable unicorn/prevent-abbreviations */
import { spawn } from 'child_process';
import { getPackedAppPath } from '../features/supports/paths';

// You can also use `pnpm dlx tsx scripts/startMockOpenAI.ts`

const appPath = getPackedAppPath();
console.log('Starting TidGi E2E app:', appPath);

const environment = Object.assign({}, process.env, {
  NODE_ENV: 'test',
  LANG: process.env.LANG || 'zh-Hans.UTF-8',
  LANGUAGE: process.env.LANGUAGE || 'zh-Hans:zh',
  LC_ALL: process.env.LC_ALL || 'zh-Hans.UTF-8',
});

const child = spawn(appPath, [], { env: environment, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 0));
child.on('error', error => {
  console.error('Failed to start TidGi app:', error);
  process.exit(1);
});
