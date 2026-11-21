// @vitest-environment node
import { createPackageWithOptions } from '@electron/asar';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import forgeConfig from '../../forge.config';

describe('packaged utility process files', () => {
  it('makes hashed workers, shared JS chunks, and native modules accessible outside asar', async () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tidgi-asar-'));
    const source = path.join(fixture, 'app');
    const archive = path.join(fixture, 'app.asar');
    const unpackedFiles = [
      '.vite/build/wikiWorker-a123.js',
      '.vite/build/chunks/shared-b456.js',
      'node_modules/example/build/native.node',
    ];
    try {
      for (const file of [...unpackedFiles, 'renderer/index.html']) {
        fs.outputFileSync(path.join(source, file), file);
      }
      const asar = forgeConfig.packagerConfig?.asar;
      if (typeof asar !== 'object' || asar === null) throw new Error('Expected asar options');
      await createPackageWithOptions(source, archive, asar);
      for (const file of unpackedFiles) {
        expect(fs.readFileSync(path.join(`${archive}.unpacked`, file), 'utf8')).toBe(file);
      }
      expect(fs.existsSync(path.join(`${archive}.unpacked`, 'renderer/index.html'))).toBe(false);
    } finally {
      fs.removeSync(fixture);
    }
  });
});
