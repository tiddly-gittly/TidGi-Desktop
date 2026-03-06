import { type AddressInfo, createServer, type Server } from 'node:net';
import { describe, expect, it } from 'vitest';
import { findAvailablePort, isPortAvailable } from '../port';

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function occupyPort(): Promise<{ port: number; server: Server }> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  return { port, server };
}

async function findFreePort(): Promise<number> {
  const { port, server } = await occupyPort();
  await closeServer(server);
  return port;
}

describe('Port Utilities', () => {
  describe('isPortAvailable', () => {
    it('should return true for an available port', async () => {
      const port = await findFreePort();
      const available = await isPortAvailable(port);
      expect(available).toBe(true);
    });

    it('should handle occupied ports gracefully', async () => {
      const { port, server } = await occupyPort();
      try {
        const result = await isPortAvailable(port);
        expect(result).toBe(false);
      } finally {
        await closeServer(server);
      }
    });
  });

  describe('findAvailablePort', () => {
    it('should return the same port if available', async () => {
      const port = await findFreePort();
      const result = await findAvailablePort(port);
      expect(result).toBe(port);
    });

    it('should find an available port when the requested port is occupied', async () => {
      const { port, server } = await occupyPort();
      try {
        const result = await findAvailablePort(port);
        expect(result).not.toBeNull();
        if (result !== null) {
          expect(result).not.toBe(port);
          expect(result).toBeGreaterThanOrEqual(port);
        }
      } finally {
        await closeServer(server);
      }
    });

    it('should eventually find an available port', async () => {
      const port = await findFreePort();
      const result = await findAvailablePort(port);
      expect(result).not.toBeNull();
      if (result !== null) {
        expect(typeof result).toBe('number');
      }
    });
  });
});
