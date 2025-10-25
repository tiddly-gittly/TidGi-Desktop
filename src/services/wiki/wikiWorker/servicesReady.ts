/**
 * Worker services readiness state management
 * Separated from services.ts to avoid circular dependencies and bundling issues
 */

/**
 * Callbacks to execute when worker services are ready
 */
const onServicesReadyCallbacks: Array<() => void> = [];
let servicesReady = false;

/**
 * Register a callback to be called when worker services are ready to use
 */
export function onWorkerServicesReady(callback: () => void): void {
  if (servicesReady) {
    // Already ready, call immediately
    callback();
  } else {
    onServicesReadyCallbacks.push(callback);
  }
}

/**
 * Mark worker services as ready and execute all pending callbacks
 * This should be called by main process after attachWorker is complete
 */
export function notifyServicesReady(): void {
  console.log('[servicesReady] Worker services marked as ready');
  servicesReady = true;
  onServicesReadyCallbacks.forEach(callback => {
    callback();
  });
  onServicesReadyCallbacks.length = 0; // Clear callbacks
}
