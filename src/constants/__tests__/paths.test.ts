import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { NSFW_BINARY_PATH, resolveNsfwBinaryPath } from '../paths';

describe('nsfw native binary path', () => {
  it('resolves the development binary below the project node_modules folder', () => {
    expect(resolveNsfwBinaryPath('/project/node_modules')).toBe(
      path.resolve('/project/node_modules', 'nsfw', 'build', 'Release', 'nsfw.node'),
    );
  });

  it('resolves the packaged binary below Resources/node_modules', () => {
    expect(resolveNsfwBinaryPath('/Applications/TidGi.app/Contents/Resources/node_modules')).toBe(
      '/Applications/TidGi.app/Contents/Resources/node_modules/nsfw/build/Release/nsfw.node',
    );
  });

  it('rejects an empty package path base instead of producing an empty env value', () => {
    expect(() => resolveNsfwBinaryPath('   ')).toThrow('package path base');
  });

  it('exports the current environment binary path as an absolute path', () => {
    expect(path.isAbsolute(NSFW_BINARY_PATH)).toBe(true);
    expect(NSFW_BINARY_PATH).toMatch(/[\\/]nsfw[\\/]build[\\/]Release[\\/]nsfw\.node$/);
  });
});
