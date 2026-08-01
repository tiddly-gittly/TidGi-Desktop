import { describe, expect, it, vi } from 'vitest';
import { bootstrapMainProcess } from '../mainBootstrap';

describe('bootstrapMainProcess', () => {
  it('does not load application services for a time-limited Squirrel event', async () => {
    const loadMainApplication = vi.fn<() => Promise<unknown>>();

    await bootstrapMainProcess(true, loadMainApplication);

    expect(loadMainApplication).not.toHaveBeenCalled();
  });

  it('loads the complete main process for a regular launch', async () => {
    const loadMainApplication = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined);

    await bootstrapMainProcess(false, loadMainApplication);

    expect(loadMainApplication).toHaveBeenCalledOnce();
  });

  it('propagates a main-process loading failure to the entry-point handler', async () => {
    const error = new Error('load failed');
    const loadMainApplication = vi.fn<() => Promise<unknown>>().mockRejectedValue(error);

    await expect(bootstrapMainProcess(false, loadMainApplication)).rejects.toBe(error);
  });
});
