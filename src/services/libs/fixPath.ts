/**
 * This fixes https://github.com/google/zx/issues/230
 */
import { isWin } from '@/helpers/system';
import { execSync } from 'child_process';
import { userInfo } from 'os';
import process from 'process';
import stripAnsi from 'strip-ansi';

const defaultShell = (() => {
  const { env, platform } = process;
  if (platform === 'win32') {
    return env.COMSPEC ?? 'pwsh.exe'; // 'cmd.exe';
  }
  try {
    const { shell } = userInfo();
    if (shell) {
      return shell;
    }
  } catch (_error: unknown) {
    // userInfo may throw in some environments; ignore and fallback to defaults
    void _error;
  }
  if (platform === 'darwin') {
    return env.SHELL ?? '/bin/zsh';
  }
  return env.SHELL ?? '/bin/sh';
})();

const arguments_ = ['-ilc', 'echo -n "_SHELL_ENV_DELIMITER_"; env; echo -n "_SHELL_ENV_DELIMITER_"; exit'];

const environment = {
  // Disables Oh My Zsh auto-update thing that can block the process.
  DISABLE_AUTO_UPDATE: 'true',
};

const parseEnvironment = (environment_: string): Record<string, string> => {
  environment_ = environment_.split('_SHELL_ENV_DELIMITER_')[1];
  const returnValue: Record<string, string> = {};

  for (const line of stripAnsi(environment_).split('\n').filter(Boolean)) {
    const [key, ...values] = line.split('=');
    returnValue[key] = values.join('=');
  }

  return returnValue;
};

/**
 * Validates that a shell path is safe to execute
 * Only allows absolute paths without shell metacharacters
 */
function validateShellPath(shellPath: string): boolean {
  // Must be an absolute path
  if (!shellPath.startsWith('/')) {
    return false;
  }
  // Must not contain shell metacharacters that could enable injection
  const dangerousChars = /[;&|`$(){}[\]<>'"\\]/;
  if (dangerousChars.test(shellPath)) {
    return false;
  }
  return true;
}

export function shellEnvironmentSync(shell?: string): NodeJS.ProcessEnv {
  if (isWin) {
    return process.env;
  }

  const shellToUse = shell ?? defaultShell;

  // Validate shell path to prevent command injection
  if (!validateShellPath(shellToUse)) {
    console.warn(`[fixPath] Invalid shell path rejected: ${shellToUse}`);
    return process.env;
  }

  try {
    // Execute with validated shell path - shell path is validated above to prevent injection
    const stdout = execSync(`${shellToUse} ${arguments_.join(' ')}`, {
      env: environment,
    });
    return parseEnvironment(String(stdout));
  } catch (error) {
    if (shell === undefined) {
      return process.env;
    } else {
      throw error;
    }
  }
}

export function shellPathSync(): string | undefined {
  const { PATH } = shellEnvironmentSync();
  return PATH;
}

export function fixPath(): void {
  if (isWin) {
    return;
  }
  process.env.PATH = shellPathSync() ?? ['./node_modules/.bin', '/.nodebrew/current/bin', '/usr/local/bin', process.env.PATH].join(':');
}
