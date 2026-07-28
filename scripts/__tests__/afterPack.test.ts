import fs from 'fs-extra';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolvePackageDirectory } from '../afterPack';

describe('resolvePackageDirectory', () => {
  it('resolves a dependency using its parent package pnpm context', () => {
    const typeormFolder = resolvePackageDirectory('typeorm', path.resolve('node_modules'));
    const yargsFolder = resolvePackageDirectory('yargs', typeormFolder);
    const yargsPackage = fs.readJsonSync(path.join(yargsFolder, 'package.json')) as { version: string };

    expect(yargsPackage.version).toBe('18.0.0');
  });
});
