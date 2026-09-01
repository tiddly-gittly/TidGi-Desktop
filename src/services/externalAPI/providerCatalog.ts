import fs from 'node:fs/promises';
import path from 'node:path';

import { type ModelCatalog, type ModelCatalogCache, ModelCatalogManager, parseModelCatalog, type PreparedModelCatalogCacheWrite } from 'memeloop/model-catalog';

class FileModelCatalogCache implements ModelCatalogCache {
  public constructor(private readonly cachePath: string) {}

  public async load(signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    try {
      const text = await fs.readFile(this.cachePath, { encoding: 'utf8', signal });
      signal.throwIfAborted();
      return JSON.parse(text) as unknown;
    } catch (error) {
      if (signal.aborted) signal.throwIfAborted();
      if (isNodeError(error) && error.code === 'ENOENT') return undefined;
      throw error;
    }
  }

  public async prepareSave(
    catalog: ModelCatalog,
    signal: AbortSignal,
  ): Promise<PreparedModelCatalogCacheWrite> {
    signal.throwIfAborted();
    const validated = parseModelCatalog(catalog);
    const temporaryPath = `${this.cachePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(validated)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        signal,
      });
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
    let active = true;
    return {
      commit: async commitSignal => {
        commitSignal.throwIfAborted();
        if (!active) return;
        active = false;
        await fs.rename(temporaryPath, this.cachePath);
      },
      discard: async () => {
        if (!active) return;
        active = false;
        await fs.rm(temporaryPath, { force: true });
      },
    };
  }
}

/** Create the Desktop filesystem adapter around Core's single-flight catalog lifecycle. */
export function createDesktopModelCatalogManager(options: {
  cachePath: string;
  fetch?: typeof globalThis.fetch;
}): ModelCatalogManager {
  return new ModelCatalogManager({
    cache: new FileModelCatalogCache(options.cachePath),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
