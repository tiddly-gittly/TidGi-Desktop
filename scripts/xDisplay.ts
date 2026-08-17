import { spawnSync } from 'node:child_process';

export function requiresVirtualXDisplay(platform: NodeJS.Platform, hasDisplay: boolean): boolean {
  return platform === 'linux' && !hasDisplay;
}

export function isXDisplayReachable(display: string | undefined): boolean {
  if (!display) return false;
  try {
    return spawnSync('xdpyinfo', ['-display', display], {
      stdio: 'ignore',
      timeout: 2000,
    }).status === 0;
  } catch {
    return false;
  }
}

export function isXvfbRunAvailable(): boolean {
  try {
    return spawnSync('which', ['xvfb-run'], { stdio: 'pipe', timeout: 3000 }).status === 0;
  } catch {
    return false;
  }
}

export function reExecuteCurrentScriptUnderXvfb(environmentMarker: string): never {
  const result = spawnSync('xvfb-run', [
    '-a',
    '--server-args=-screen 0 1920x1080x24',
    process.execPath,
    ...process.execArgv,
    process.argv[1],
    ...process.argv.slice(2),
  ], {
    stdio: 'inherit',
    env: { ...process.env, [environmentMarker]: '1' },
  });
  process.exit(result.status ?? 1);
}
