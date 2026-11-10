import { describe, expect, it, vi } from 'vitest';
import { SettingsWriteQueue } from '../settingsFileIO';

describe('DatabaseService settings write queue', () => {
  it('serializes concurrent writes and persists the newest complete object', async () => {
    const queue = new SettingsWriteQueue();
    const settings = {
      unknownFutureField: { preserve: true },
      preferences: { revision: 1 },
    };
    const snapshots: unknown[] = [];
    let releaseFirstWrite!: () => void;
    const firstWriteStarted = vi.fn();

    const firstWrite = queue.enqueue(async () => {
      snapshots.push(structuredClone(settings));
      firstWriteStarted();
      await new Promise<void>(resolve => {
        releaseFirstWrite = resolve;
      });
    });
    await vi.waitFor(() => {
      expect(firstWriteStarted).toHaveBeenCalledOnce();
    });

    settings.preferences = { revision: 2 };
    const secondWrite = queue.enqueue(async () => {
      snapshots.push(structuredClone(settings));
    });
    expect(snapshots).toHaveLength(1);

    releaseFirstWrite();
    await Promise.all([firstWrite, secondWrite]);

    expect(snapshots[0]).toEqual({ unknownFutureField: { preserve: true }, preferences: { revision: 1 } });
    expect(snapshots[1]).toEqual({ unknownFutureField: { preserve: true }, preferences: { revision: 2 } });
  });
});
