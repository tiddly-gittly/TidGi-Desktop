// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DESKTOP_ATTACHMENT_UPLOAD_LIMITS, DesktopAttachmentUploadStore } from '../attachmentUploadStore';

const bytes = (...values: number[]) => Uint8Array.from(values);
const digest = (data: Uint8Array): string => `sha256:${createHash('sha256').update(data).digest('hex')}`;

describe('DesktopAttachmentUploadStore', () => {
  let directory: string;
  let store: DesktopAttachmentUploadStore;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'tidgi-attachment-'));
    store = new DesktopAttachmentUploadStore(directory);
    await store.initialize();
  });

  afterEach(async () => {
    await store.dispose();
    await rm(directory, { recursive: true, force: true });
  });

  it('commits contiguous chunks and exposes only bounded ranges', async () => {
    const data = bytes(1, 2, 3, 4, 5);
    const scope = {
      ...(await store.begin({
        conversationId: 'conversation-1',
        filename: 'test.bin',
        mimeType: 'application/octet-stream',
        totalBytes: data.byteLength,
        sha256: digest(data),
      })),
      conversationId: 'conversation-1',
    };
    await expect(store.write({ ...scope, offset: 0, data: data.slice(0, 2) })).resolves.toEqual({ nextOffset: 2 });
    await expect(store.write({ ...scope, offset: 2, data: data.slice(2) })).resolves.toEqual({ nextOffset: 5 });
    const reference = await store.commit(scope);

    expect(reference).toEqual({
      contentHash: digest(data),
      filename: 'test.bin',
      mimeType: 'application/octet-stream',
      size: 5,
    });
    await expect(store.getReference(reference.contentHash)).resolves.toEqual(reference);
    await expect(store.readRange(reference.contentHash, 1, 3)).resolves.toEqual(bytes(2, 3, 4));
    await expect(store.readRange(reference.contentHash, 5, 3)).resolves.toBeNull();
    expect(store.hasCommittedScope('conversation-1', reference)).toBe(true);
    expect(store.hasCommittedScope('conversation-2', reference)).toBe(false);
    expect(store.hasCommittedScope('conversation-1', reference)).toBe(true);
    expect(store.consumeCommittedScope('conversation-1', reference)).toBe(true);
    expect(store.hasCommittedScope('conversation-1', reference)).toBe(false);
    expect(store.consumeCommittedScope('conversation-1', reference)).toBe(false);
  });

  it('rejects oversized chunks, total sizes and non-contiguous offsets', async () => {
    const maximum = await store.begin({
      conversationId: 'conversation-1',
      filename: 'maximum.bin',
      mimeType: 'application/octet-stream',
      totalBytes: DESKTOP_ATTACHMENT_UPLOAD_LIMITS.totalBytes,
    });
    await store.abort({ ...maximum, conversationId: 'conversation-1' });
    await expect(store.begin({
      conversationId: 'conversation-1',
      filename: 'large.bin',
      mimeType: 'application/octet-stream',
      totalBytes: DESKTOP_ATTACHMENT_UPLOAD_LIMITS.totalBytes + 1,
    })).rejects.toThrow('total size');

    const scope = {
      ...(await store.begin({
        conversationId: 'conversation-1',
        filename: 'chunk.bin',
        mimeType: 'application/octet-stream',
        totalBytes: DESKTOP_ATTACHMENT_UPLOAD_LIMITS.chunkBytes + 1,
      })),
      conversationId: 'conversation-1',
    };
    await expect(store.write({
      ...scope,
      offset: 0,
      data: new Uint8Array(DESKTOP_ATTACHMENT_UPLOAD_LIMITS.chunkBytes + 1),
    })).rejects.toThrow('chunk size');
    await expect(store.write({ ...scope, offset: 1, data: bytes(1) })).rejects.toThrow('offset');
  });

  it('cleans up a hash mismatch without granting a scope', async () => {
    const data = bytes(1, 2, 3);
    const scope = {
      ...(await store.begin({
        conversationId: 'conversation-1',
        filename: 'bad.bin',
        mimeType: 'application/octet-stream',
        totalBytes: data.byteLength,
        sha256: '0'.repeat(64),
      })),
      conversationId: 'conversation-1',
    };
    await store.write({ ...scope, offset: 0, data });
    await expect(store.commit(scope)).rejects.toThrow('sha256 mismatch');
    await expect(store.getReference(digest(data))).resolves.toBeNull();
    expect(store.consumeCommittedScope('conversation-1', {
      contentHash: digest(data),
      filename: 'bad.bin',
      mimeType: 'application/octet-stream',
      size: data.byteLength,
    })).toBe(false);
  });

  it('never permits another conversation to mutate or consume an upload', async () => {
    const scope = {
      ...(await store.begin({
        conversationId: 'conversation-1',
        filename: 'scoped.bin',
        mimeType: 'application/octet-stream',
        totalBytes: 1,
      })),
      conversationId: 'conversation-1',
    };
    await expect(store.write({ ...scope, conversationId: 'conversation-2', offset: 0, data: bytes(1) })).rejects.toThrow('scope mismatch');
    await expect(store.abort({ ...scope, conversationId: 'conversation-2' })).rejects.toThrow('scope mismatch');
    await store.write({ ...scope, offset: 0, data: bytes(1) });
    const reference = await store.commit(scope);
    expect(store.consumeCommittedScope('conversation-2', reference)).toBe(false);
    expect(store.consumeCommittedScope('conversation-1', reference)).toBe(true);
  });

  it('revokes a late committed scope when abort follows commit', async () => {
    const scope = {
      ...(await store.begin({
        conversationId: 'conversation-1',
        filename: 'late.bin',
        mimeType: 'application/octet-stream',
        totalBytes: 1,
      })),
      conversationId: 'conversation-1',
    };
    await store.write({ ...scope, offset: 0, data: bytes(9) });
    const reference = await store.commit(scope);
    await store.abort(scope);
    expect(store.consumeCommittedScope('conversation-1', reference)).toBe(false);
  });

  it('does not consume a grant when the renderer tampers with reference metadata', async () => {
    const scope = {
      ...(await store.begin({
        conversationId: 'conversation-1',
        filename: 'trusted.bin',
        mimeType: 'application/octet-stream',
        totalBytes: 1,
      })),
      conversationId: 'conversation-1',
    };
    await store.write({ ...scope, offset: 0, data: bytes(3) });
    const reference = await store.commit(scope);
    expect(store.consumeCommittedScope('conversation-1', { ...reference, filename: 'forged.bin' })).toBe(false);
    expect(store.consumeCommittedScope('conversation-1', { ...reference, mimeType: 'text/plain' })).toBe(false);
    expect(store.consumeCommittedScope('conversation-1', { ...reference, size: 2 })).toBe(false);
    expect(store.consumeCommittedScope('conversation-1', reference)).toBe(true);
  });

  it('deduplicates identical content without replacing event-scoped metadata', async () => {
    const data = bytes(7, 8);
    const upload = async (filename: string) => {
      const scope = {
        ...(await store.begin({
          conversationId: 'conversation-1',
          filename,
          mimeType: 'application/octet-stream',
          totalBytes: data.byteLength,
        })),
        conversationId: 'conversation-1',
      };
      await store.write({ ...scope, offset: 0, data });
      return store.commit(scope);
    };
    const first = await upload('first.bin');
    const second = await upload('second.bin');
    expect(second).toEqual({ ...first, filename: 'second.bin' });
    await expect(store.getReference(first.contentHash)).resolves.toEqual(first);
  });

  it('removes only bounded, stale, regular staging artifacts at startup', async () => {
    const cleanupRoot = await mkdtemp(path.join(tmpdir(), 'tidgi-attachment-cleanup-'));
    const staging = path.join(cleanupRoot, 'staging');
    await mkdir(staging, { recursive: true });
    const stale = `${randomUUID()}.part`;
    const recent = `${randomUUID()}.json`;
    const unrelated = 'keep.txt';
    await Promise.all([
      writeFile(path.join(staging, stale), 'stale'),
      writeFile(path.join(staging, recent), 'recent'),
      writeFile(path.join(staging, unrelated), 'unrelated'),
    ]);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(path.join(staging, stale), old, old);
    const cleanupStore = new DesktopAttachmentUploadStore(cleanupRoot);
    try {
      await cleanupStore.initialize();
      expect((await readdir(staging)).sort()).toEqual([recent, unrelated].sort());
    } finally {
      await cleanupStore.dispose();
      await rm(cleanupRoot, { recursive: true, force: true });
    }
  });
});
