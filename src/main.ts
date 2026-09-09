/**
 * Keep the Electron entry point intentionally lightweight.
 *
 * Squirrel allows only a short window for install/update hooks to exit. Loading
 * the complete application first can exceed that window on slower Windows
 * machines, so process installer events before importing any application
 * services, databases, or workers.
 */
import { app } from 'electron';
import { bootstrapMainProcess } from './helpers/mainBootstrap';
import squirrelStartup from './helpers/squirrelStartup';

void bootstrapMainProcess(squirrelStartup, () => import('./mainApplication')).catch((error: unknown) => {
  console.error('Failed to load the TidGi main process', error);
  app.exit(1);
});
