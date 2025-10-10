import { app } from 'electron';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Tests for appPaths.ts
 *
 * NOTE: In test environment, the `electron` module is mocked in setup-vitest.ts
 * The mock provides:
 * - app.setPath(key, value): Stores path values in memory
 * - app.getPath(key): Retrieves stored path values
 *
 * This allows appPaths.ts to correctly set userData path to 'userData-test'
 * during test execution, ensuring test databases and settings are isolated
 * from development/production data.
 */
describe('appPaths - Test Environment Path Configuration', () => {
  it('should set userData path to userData-test directory in test environment', async () => {
    // Import appPaths to trigger the path setup logic
    await import('@/constants/appPaths');

    const userDataPath = app.getPath('userData');
    const expectedPath = path.resolve(process.cwd(), 'userData-test');

    expect(userDataPath).toBe(expectedPath);
    expect(userDataPath).toContain('userData-test');
  });

  it('should verify that CACHE_DATABASE_FOLDER uses the correct test path', async () => {
    // Import the constants after appPaths has been loaded
    const { CACHE_DATABASE_FOLDER } = await import('@/constants/appPaths');

    const expectedCachePath = path.resolve(process.cwd(), 'userData-test', 'cache-database');

    expect(CACHE_DATABASE_FOLDER).toBe(expectedCachePath);
    expect(CACHE_DATABASE_FOLDER).toContain('userData-test');
    expect(CACHE_DATABASE_FOLDER).toContain('cache-database');
  });

  it('should verify that SETTINGS_FOLDER uses the correct test path', async () => {
    const { SETTINGS_FOLDER } = await import('@/constants/appPaths');

    const expectedSettingsPath = path.resolve(process.cwd(), 'userData-test', 'settings');

    expect(SETTINGS_FOLDER).toBe(expectedSettingsPath);
    expect(SETTINGS_FOLDER).toContain('userData-test');
    expect(SETTINGS_FOLDER).toContain('settings');
  });

  it('should verify environment detection is working correctly', async () => {
    const { isTest } = await import('@/constants/environment');

    // Verify we're in test environment
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.VITEST).toBe('true');
    expect(isTest).toBe(true);
  });

  it('should demonstrate that electron app mock is working', () => {
    // This test documents how the electron mock works
    const originalPath = app.getPath('userData');

    // Test that setPath actually stores the value (unlike a no-op mock)
    app.setPath('userData', '/some/test/path');
    expect(app.getPath('userData')).toBe('/some/test/path');

    // Restore original path
    app.setPath('userData', originalPath);
    expect(app.getPath('userData')).toBe(originalPath);
  });
});
