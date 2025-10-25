// pnpm exec cross-env NODE_ENV=test tsx ./scripts/start-e2e-app.ts
import { spawn } from 'child_process';
import { getPackedAppPath } from '../features/supports/paths';

// You can also use `pnpm dlx tsx scripts/startMockOpenAI.ts`

const appPath = getPackedAppPath();
console.log('Starting TidGi E2E app:', appPath);

const env = Object.assign({}, process.env, {
  NODE_ENV: 'test',
  LANG: process.env.LANG || 'zh-Hans.UTF-8',
  LANGUAGE: process.env.LANGUAGE || 'zh-Hans:zh',
  LC_ALL: process.env.LC_ALL || 'zh-Hans.UTF-8',
});

const child = spawn(appPath, [], { env, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 0));
child.on('error', err => {
  console.error('Failed to start TidGi app:', err);
  process.exit(1);
});
