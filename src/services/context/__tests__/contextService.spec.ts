import * as appPaths from '@/constants/appPaths';
import * as paths from '@/constants/paths';
import { ContextService } from '@services/context';
import { describe, expect, it } from 'vitest';

describe('ContextService exposes constants from paths/appPaths', () => {
  const svc = new ContextService();

  it('should expose all keys exported from src/constants/paths.ts', async () => {
    const keys = Object.keys(paths) as Array<keyof typeof paths>;
    for (const k of keys) {
      // some module exports might be non-serializable (functions) - just ensure presence
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = await svc.get(k as any);
      expect(value).toBeDefined();
    }
  });

  it('should expose all keys exported from src/constants/appPaths.ts', async () => {
    const keys = Object.keys(appPaths) as Array<keyof typeof appPaths>;
    for (const k of keys) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = await svc.get(k as any);
      expect(value).toBeDefined();
    }
  });
});
