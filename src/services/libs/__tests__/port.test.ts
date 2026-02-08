import { describe, expect, it } from 'vitest';
import { findAvailablePort, isPortAvailable } from '../port';

describe('Port Utilities', () => {
  describe('isPortAvailable', () => {
    it('should return true for available high-numbered port', async () => {
      const available = await isPortAvailable(59999);
      expect(available).toBe(true);
    });

    it('should handle occupied ports gracefully', async () => {
      const result = await isPortAvailable(80);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('findAvailablePort', () => {
    it('should return the same port if available', async () => {
      const testPort = 59998;
      const result = await findAvailablePort(testPort);
      expect(result).toBe(testPort);
    });

    it('should find an available port when starting from a commonly used port', async () => {
      const testPort = 5212;
      const result = await findAvailablePort(testPort);
      expect(result).not.toBeNull();
      if (result !== null) {
        expect(result).toBeGreaterThanOrEqual(testPort);
      }
    });

    it('should eventually find an available port', async () => {
      const testPort = 59997;
      const result = await findAvailablePort(testPort);
      expect(result).not.toBeNull();
      expect(typeof result).toBe('number');
    });
  });
});
