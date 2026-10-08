import { describe, expect, it, vi } from 'vitest';
import { logForBestEffort, type WorkerLogSink } from '../workerLogging';

const context = {
  process: 'wiki-worker',
  scope: {
    kind: 'workspace',
    workspaceID: 'workspace-1',
    workspaceName: 'Wiki',
  },
  component: 'wiki-worker',
} as const;

describe('logForBestEffort', () => {
  it('contains an asynchronous logging rejection', async () => {
    const sink: WorkerLogSink = {
      logFor: vi
        .fn()
        .mockRejectedValue(
          new Error('Service call timeout: NativeChannel.logFor'),
        ),
    };

    await expect(
      logForBestEffort(sink, context, 'info', 'starting'),
    ).resolves.toBeUndefined();
    expect(sink.logFor).toHaveBeenCalledWith(
      context,
      'info',
      'starting',
      undefined,
    );
  });

  it('contains a synchronous proxy failure', async () => {
    const sink: WorkerLogSink = {
      logFor: vi.fn(() => {
        throw new Error('transport detached');
      }),
    };

    await expect(
      logForBestEffort(sink, context, 'error', 'failed'),
    ).resolves.toBeUndefined();
  });
});
