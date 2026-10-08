import type { IDatabaseService } from '@services/database/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../index';

describe('AnalyticsService', () => {
  let preferenceStore: Record<string, unknown>;
  let preferenceService: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  let mockDatabase: IDatabaseService;

  beforeEach(() => {
    preferenceStore = {};
    preferenceService = {
      get: vi.fn(async (key: string) => preferenceStore[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        preferenceStore[key] = value;
      }),
    };
    mockDatabase = {
      getSetting: vi.fn(),
      setSetting: vi.fn(),
      immediatelyStoreSettingsToFile: vi.fn().mockResolvedValue(undefined),
    } as unknown as IDatabaseService;
  });

  it('isEnabled returns false when analyticsEnabled preference is false', async () => {
    preferenceStore.analyticsEnabled = false;
    preferenceStore.analyticsHost = 'https://analytics.tidgi.fun';
    preferenceStore.analyticsHostname = 'desktop.tidgi.fun';
    preferenceStore.analyticsSiteId = '189dd97a8d37';
    const service = new AnalyticsService(mockDatabase, preferenceService as unknown as IPreferenceService);
    expect(await service.isEnabled()).toBe(false);
  });

  it('isEnabled returns true when enabled and configured', async () => {
    preferenceStore.analyticsEnabled = true;
    preferenceStore.analyticsHost = 'https://analytics.tidgi.fun';
    preferenceStore.analyticsHostname = 'desktop.tidgi.fun';
    preferenceStore.analyticsSiteId = '189dd97a8d37';
    const service = new AnalyticsService(mockDatabase, preferenceService as unknown as IPreferenceService);
    expect(await service.isEnabled()).toBe(true);
  });

  it('track does nothing when disabled', async () => {
    preferenceStore.analyticsEnabled = false;
    const service = new AnalyticsService(mockDatabase, preferenceService as unknown as IPreferenceService);
    await service.track('app.launched');
    expect(preferenceService.get).toHaveBeenCalledWith('analyticsEnabled');
  });

  it('trackError does nothing when disabled', async () => {
    preferenceStore.analyticsEnabled = false;
    const service = new AnalyticsService(mockDatabase, preferenceService as unknown as IPreferenceService);
    service.trackError(new Error('test'), 'test-source');
    // trackError is fire-and-forget; wait a tick
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(preferenceService.get).toHaveBeenCalledWith('analyticsEnabled');
  });
});
