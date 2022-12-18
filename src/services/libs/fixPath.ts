import { isWin } from '@/helpers/system';
import { execSync } from 'child_process';
import { userInfo } from 'os';
import process from 'process';
import stripAnsi from 'strip-ansi';

const defaultShell = (() => {
  const { env, platform } = process;
  if (platform === 'win32') {
    return env.COMSPEC ?? 'cmd.exe';
  }
  try {
    const { shell } = userInfo();
    if (shell !== undefined) {
      return shell;
    }
  } catch {}
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

export function shellEnvironmentSync(shell?: string): NodeJS.ProcessEnv {
  if (isWin) {
    return process.env;
  }

  try {
    const stdout = execSync(`${shell ?? defaultShell} ${arguments_.join(' ')}`, { env: environment });
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
