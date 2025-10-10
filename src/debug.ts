import { session } from 'electron';
import { installExtension, updateExtensions } from 'electron-chrome-web-store';

export async function initDevelopmentExtension() {
  if (process.env.NODE_ENV === 'development' && process.env.DEBUG_REACT === 'true') {
    await installExtension('fmkadmapgofadopljbjfkapdkoienihi');
    await updateExtensions();
    await launchExtensionBackgroundWorkers();
  }
}

function launchExtensionBackgroundWorkers() {
  return Promise.all(
    session.defaultSession.extensions.getAllExtensions().map(async (extension) => {
      const manifest = extension.manifest as {
        manifest_version: number;
        background?: {
          service_worker?: string;
        };
      };
      if (manifest.manifest_version === 3 && manifest.background?.service_worker) {
        await session.defaultSession.serviceWorkers.startWorkerForScope(extension.url);
      }
    }),
  );
}
