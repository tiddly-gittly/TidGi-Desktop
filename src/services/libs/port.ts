import { Server } from 'node:net';

/**
 * Check if a port is available on the local machine
 * Optimized for minimal overhead - closes server immediately after binding
 * @param port The port number to check
 * @returns true if port is available, false if in use
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = new Server();

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Other errors treated as unavailable
        resolve(false);
      }
    });

    server.once('listening', () => {
      // Close with callback to ensure cleanup before resolving
      server.close(() => {
        resolve(true);
      });
    });

    // Bind to 0.0.0.0 to check all network interfaces
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Find an available port starting from the given port
 * First tries port, then port+10, then keeps incrementing by 1
 * @param startPort The port to start checking from
 * @param maxAttempts Maximum number of attempts (default 100)
 * @returns An available port number, or null if none found
 */
export async function findAvailablePort(startPort: number, maxAttempts = 100): Promise<number | null> {
  // First try the original port
  if (await isPortAvailable(startPort)) {
    return startPort;
  }

  // Then try +10
  const portPlusTen = startPort + 10;
  if (await isPortAvailable(portPlusTen)) {
    return portPlusTen;
  }

  // Then increment by 1 from +10
  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    const portToTry = portPlusTen + attempt;
    if (await isPortAvailable(portToTry)) {
      return portToTry;
    }
  }

  return null;
}
