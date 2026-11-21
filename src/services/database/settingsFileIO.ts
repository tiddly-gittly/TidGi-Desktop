import { SETTINGS_FILE_MODE } from '@/constants/database';
import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class SettingsWriteQueue {
  private tail: Promise<void> = Promise.resolve();

  public enqueue(write: () => Promise<void>): Promise<void> {
    const queuedWrite = this.tail.catch(() => undefined).then(write);
    this.tail = queuedWrite;
    return queuedWrite;
  }
}

export async function writeSettingsFile(
  filePath: string,
  value: unknown,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const serialized = JSON.stringify(value, undefined, 2);
  await mkdir(path.dirname(filePath), { recursive: true });

  // electron-settings disables atomic replacement on Windows because open
  // handles commonly make rename fail there. Preserve that behavior.
  if (platform === 'win32') {
    await writeFile(filePath, serialized, { encoding: 'utf8' });
    return;
  }

  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, 'wx', SETTINGS_FILE_MODE);
    await handle.writeFile(serialized, { encoding: 'utf8' });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, filePath);
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
  }
}
