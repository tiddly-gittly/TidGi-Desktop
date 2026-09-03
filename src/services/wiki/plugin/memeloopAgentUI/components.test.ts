import { createDesktopFileAttachmentSource } from '@/pages/Agent/adapters/DesktopAgentExecutionCoordinator';
import { describe, expect, it } from 'vitest';

describe('MemeLoop TiddlyWiki attachment binding', () => {
  it('uses the same portable bounded source as the Desktop coordinator path', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'wiki.bin', { type: 'application/octet-stream' });
    const source = createDesktopFileAttachmentSource(file);

    expect(source).toMatchObject({
      kind: 'source',
      filename: 'wiki.bin',
      mimeType: 'application/octet-stream',
      totalBytes: 3,
    });
    if (source.kind !== 'source') throw new Error('expected source attachment');
    await expect(source.readChunk(0, 2)).resolves.toEqual(new Uint8Array([1, 2]));
    await expect(source.readChunk(2, 2)).resolves.toEqual(new Uint8Array([3]));
    await expect(source.readChunk(3, 2)).resolves.toBeNull();
  });
});
