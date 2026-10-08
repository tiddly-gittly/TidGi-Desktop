import { spawnSync } from 'node:child_process';

export function requiresVirtualXDisplay(platform: NodeJS.Platform, hasDisplay: boolean): boolean {
  return platform === 'linux' && !hasDisplay;
}

export function isXDisplayReachable(display: string | undefined): boolean {
  if (!display) return false;
  try {
    const result = spawnSync('xdpyinfo', ['-display', display], {
      stdio: 'ignore',
      timeout: 2000,
    });
    // `xdpyinfo` is provided by x11-utils, which is not installed on every
    // runner that has xvfb. A non-empty DISPLAY is still the best signal in
    // that environment; avoid nesting a second xvfb-run around a live server.
    if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`[xDisplay] xdpyinfo is unavailable; trusting DISPLAY=${display}`);
      return true;
    }
    return result.status === 0;
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
