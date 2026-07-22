import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    quit: vi.fn(),
  },
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawn: vi.fn(() => ({ on: vi.fn() })),
  };
});

describe('installLocalUninstallIcon', () => {
  const tempDirectories: string[] = [];

  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('copies packaged icon.ico to install-root app.ico and sets DisplayIcon', async () => {
    const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-squirrel-icon-'));
    tempDirectories.push(installRoot);
    const appDirectory = path.join(installRoot, 'app-0.14.1');
    const resourcesDirectory = path.join(appDirectory, 'resources');
    fs.mkdirSync(resourcesDirectory, { recursive: true });
    const sourceIco = path.join(resourcesDirectory, 'icon.ico');
    fs.writeFileSync(sourceIco, Buffer.from('fake-ico'));
    const execPath = path.join(appDirectory, 'tidgi.exe');
    fs.writeFileSync(execPath, '');

    const runReg = vi.fn().mockReturnValue({ status: 0, stderr: '', error: undefined });
    const { installLocalUninstallIcon } = await import('../squirrelStartup');
    const targetIco = installLocalUninstallIcon(execPath, resourcesDirectory, runReg);

    expect(targetIco).toBe(path.join(installRoot, 'app.ico'));
    expect(fs.readFileSync(targetIco!, 'utf8')).toBe('fake-ico');
    expect(runReg).toHaveBeenCalledWith(
      'reg',
      [
        'add',
        `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${path.basename(installRoot)}`,
        '/v',
        'DisplayIcon',
        '/t',
        'REG_SZ',
        '/d',
        targetIco,
        '/f',
      ],
      { windowsHide: true, encoding: 'utf8' },
    );
  });

  it('returns undefined when no packaged icon exists', async () => {
    const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-squirrel-icon-missing-'));
    tempDirectories.push(installRoot);
    const appDirectory = path.join(installRoot, 'app-0.14.1');
    fs.mkdirSync(appDirectory, { recursive: true });
    const execPath = path.join(appDirectory, 'tidgi.exe');
    fs.writeFileSync(execPath, '');
    const resourcesDirectory = path.join(appDirectory, 'resources');
    fs.mkdirSync(resourcesDirectory, { recursive: true });

    const runReg = vi.fn();
    const { installLocalUninstallIcon } = await import('../squirrelStartup');
    expect(installLocalUninstallIcon(execPath, resourcesDirectory, runReg)).toBeUndefined();
    expect(runReg).not.toHaveBeenCalled();
  });
});
