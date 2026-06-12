import { execSync } from 'child_process';

/**
 * Terminate a process and its descendants. Only targets the given PID —
 * never kills unrelated processes (e.g. a production TidGi the developer has open).
 */
export function killProcessTree(pid: number | undefined): void {
  if (pid === undefined || pid <= 0) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      return;
    }

    // Unix: try process group first (Playwright may spawn in a new group), then single PID.
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      process.kill(pid, 'SIGKILL');
    }
  } catch {
    // Process already exited or kill failed — ignore.
  }
}
