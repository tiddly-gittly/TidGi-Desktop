import path from 'path';

/**
 * Helper to get the main window entry URL
 * Following the official Electron Forge Vite plugin pattern:
 * https://www.electronforge.io/config/plugins/vite
 *
 * In development: returns dev server URL (e.g., http://localhost:3012)
 * In production: returns file:// path to index.html
 */
export function getMainWindowEntry(): string {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log('[viteEntry] Using dev server URL:', MAIN_WINDOW_VITE_DEV_SERVER_URL);
    return MAIN_WINDOW_VITE_DEV_SERVER_URL;
  }
  // In production, the built files are in app.asar/.vite/renderer/index.html
  // Note: MAIN_WINDOW_VITE_NAME is defined but the actual path doesn't use it
  const rendererPath = path.resolve(__dirname, '..', 'renderer', 'index.html');
  const fileUrl = `file://${rendererPath.replace(/\\/g, '/')}`;
  console.log('[viteEntry] Using production file URL:', fileUrl, '__dirname:', __dirname);
  return fileUrl;
}

/**
 * Get preload script path
 * In Electron Forge Vite plugin:
 * - Development: preload is built to .vite/build/index.js (same dir as main)
 * - Production: preload is packaged in resources/app/.vite/build/index.js
 */
export function getPreloadPath(): string {
  // Both in dev and prod, preload.js is in the same directory as main.js (__dirname)
  const preloadPath = path.join(__dirname, 'index.js');
  console.log('[viteEntry] Preload path:', preloadPath, '__dirname:', __dirname);
  return preloadPath;
}
