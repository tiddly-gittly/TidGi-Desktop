#!/usr/bin/env tsx

/**
 * Dev server launcher with X display auto-detection.
 *
 * Priority order:
 *   1. $DISPLAY environment variable (already set — desktop session, SSH -X, etc.)
 *   2. A running desktop session (plasma/gnome/xfce/cinnamon) — extracts its
 *      DISPLAY/WAYLAND_DISPLAY/DBUS_SESSION_BUS_ADDRESS so Electron appears on
 *      the real desktop (visible via KRDP/VNC).
 *   3. xvfb-run (virtual display, headless/CI/SSH without desktop).
 *
 * Without this, on a server with a real desktop but VS Code Remote SSH (which
 * does not forward $DISPLAY), `electron-forge start` would crash with
 * "Missing X server" or silently open on a virtual display invisible to KRDP.
 */

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ── Constants ─────────────────────────────────────────────────────────────────

const XVFB_WRAPPED_ENV = 'TIDGI_DEV_XVFB_WRAPPED';
const REAL_DISPLAY_WRAPPED_ENV = 'TIDGI_DEV_REAL_DISPLAY';

const DESKTOP_PROCESS_NAMES = [
  'plasmashell', // KDE
  'gnome-shell', // GNOME
  'xfce4-session', // XFCE
  'cinnamon-session', // Cinnamon
  'mate-session', // MATE
  'lxqt-session', // LXQt
  'budgie-wm', // Budgie
  'i3', // i3
  'sway', // Sway (Wayland)
];

// ── X display detection helpers ──────────────────────────────────────────────

function isDisplayReachable(display: string): boolean {
  try {
    const result = spawnSync('xdpyinfo', ['-display', display], {
      stdio: 'ignore',
      timeout: 2000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function xvfbRunAvailable(): boolean {
  try {
    const result = spawnSync('which', ['xvfb-run'], { stdio: 'pipe', timeout: 3000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Try to find a real desktop session by looking for known desktop processes
 * and extracting their environment variables (DISPLAY, WAYLAND_DISPLAY, etc.).
 *
 * Returns a set of env vars to merge, or null if no desktop session is found.
 */
function detectDesktopSessionEnvironment(): Record<string, string> | null {
  for (const processName of DESKTOP_PROCESS_NAMES) {
    try {
      const pidResult = spawnSync('pgrep', ['-u', process.env.USER ?? '', '-n', processName], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 2000,
      });
      if (pidResult.status !== 0 || !pidResult.stdout) continue;

      const pid = pidResult.stdout.toString().trim();
      if (!pid || Number.isNaN(Number(pid))) continue;

      // Read the process's environment from /proc
      const environPath = `/proc/${pid}/environ`;
      const environRaw = readFileSync(environPath);
      const environmentEntries = environRaw.toString().split('\0').filter(Boolean);

      const desktopEnvironment: Record<string, string> = {};
      const wantedKeys = ['DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_SESSION_TYPE', 'DESKTOP_SESSION'];

      for (const entry of environmentEntries) {
        const eqIndex = entry.indexOf('=');
        if (eqIndex === -1) continue;
        const key = entry.slice(0, eqIndex);
        if (wantedKeys.includes(key)) {
          desktopEnvironment[key] = entry.slice(eqIndex + 1);
        }
      }

      if (desktopEnvironment.DISPLAY || desktopEnvironment.WAYLAND_DISPLAY) {
        console.log(`🖥  Found desktop session "${processName}" (PID ${pid}), DISPLAY=${desktopEnvironment.DISPLAY ?? '(Wayland)'}`);
        return desktopEnvironment;
      }
    } catch {
      continue;
    }
  }
  return null;
}

// ── Launcher implementations ─────────────────────────────────────────────────

function launchForge(extraEnvironment: Record<string, string> = {}): void {
  const child = spawn(
    'cross-env',
    ['NODE_ENV=development', 'electron-forge', 'start'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...extraEnvironment,
        [XVFB_WRAPPED_ENV]: '1',
      },
    },
  );

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  // Forward signals so Ctrl+C works.
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

function reExecUnderXvfb(): never {
  const xvfbArguments = [
    '-a',
    '--server-args=-screen 0 1920x1080x24',
    process.execPath, // tsx
    ...process.execArgv, // preserve flags
    process.argv[1], // this script
    ...process.argv.slice(2),
  ];

  const result = spawnSync('xvfb-run', xvfbArguments, {
    stdio: 'inherit',
    env: { ...process.env, [XVFB_WRAPPED_ENV]: '1' },
  });

  process.exit(result.status ?? 0);
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  // 1. Already wrapped / display set → launch directly.
  if (process.env[XVFB_WRAPPED_ENV] || process.env[REAL_DISPLAY_WRAPPED_ENV]) {
    launchForge();
    return;
  }

  // 2. $DISPLAY is set and reachable → launch directly.
  if (process.env.DISPLAY && isDisplayReachable(process.env.DISPLAY)) {
    launchForge();
    return;
  }

  // 3. Try to find a real desktop session.
  if (!process.env.DISPLAY) {
    const desktopEnvironment = detectDesktopSessionEnvironment();
    if (desktopEnvironment) {
      console.log('🖥  Re-launching on real desktop display…');
      launchForge(desktopEnvironment);
      return;
    }
  }

  // 4. Fallback: xvfb-run.
  if (!xvfbRunAvailable()) {
    console.error(
      '⚠ No X display available and xvfb-run is not installed.\n' +
        '  Install it with: sudo apt install xvfb  (Debian/Ubuntu)\n' +
        '  or: sudo dnf install xvfb-run            (Fedora)',
    );
    process.exit(1);
  }

  console.log('🖥 No X display or desktop session detected — re-executing under xvfb-run');
  reExecUnderXvfb();
}

main();
