// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as repository from '../agentRepository';
import { DesktopAttachmentUploadStore } from '../attachmentUploadStore';
import { AgentInstanceService } from '../index';
import { AgentInstanceServiceIPCDescriptor } from '../interface';

describe('Desktop production attachment sync ports', () => {
  let directory: string;
  let store: DesktopAttachmentUploadStore;
  let service: AgentInstanceService;
  const chunkSize = 3 * 1024 * 1024;
  const referenceFor = (data: Uint8Array) => ({
    contentHash: `sha256:${createHash('sha256').update(data).digest('hex')}`,
    filename: 'sync.bin',
    mimeType: 'application/octet-stream',
    size: data.byteLength,
  });

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'tidgi-sync-'));
    store = new DesktopAttachmentUploadStore(directory);
    service = new AgentInstanceService();
    Reflect.set(service, 'attachmentUploadStore', store);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await store.dispose();
    await rm(directory, { recursive: true, force: true });
  });

  it('resumes durable staging after reopening and keeps the renderer chunk limit', async () => {
    const data = new Uint8Array(2 * chunkSize + 17).fill(42);
    const reference = referenceFor(data);
    expect(await service.stageAttachmentChunk(reference, 0, data.subarray(0, chunkSize))).toBe(chunkSize);
    expect(await service.stageAttachmentChunk(reference, chunkSize, data.subarray(chunkSize, 2 * chunkSize))).toBe(2 * chunkSize);
    expect(await service.getAttachment(reference.contentHash)).toBeNull();
    await store.dispose();
    store = new DesktopAttachmentUploadStore(directory);
    Reflect.set(service, 'attachmentUploadStore', store);
    expect(await service.stageAttachmentChunk(reference, 0, data.subarray(0, chunkSize))).toBe(2 * chunkSize);
    await service.stageAttachmentChunk(reference, 2 * chunkSize, data.subarray(2 * chunkSize));
    await service.commitStagedAttachment(reference.contentHash);
    expect(await service.verifyAttachment(reference.contentHash)).toBe(true);
    expect(await service.readAttachmentRange(reference.contentHash, 0, chunkSize)).toEqual(data.subarray(0, chunkSize));
    await expect(service.readAgentAttachmentRange(reference.contentHash, 0, chunkSize)).rejects.toThrow('range');
    for (const method of ['stageAttachmentChunk', 'commitStagedAttachment', 'verifyAttachment']) {
      expect(AgentInstanceServiceIPCDescriptor.properties).not.toHaveProperty(method);
    }
  });

  it('rejects corrupt bytes, permits a clean retry and verifies immutable blobs on read', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const reference = referenceFor(data);
    await service.stageAttachmentChunk(reference, 0, new Uint8Array([4, 5, 6]));
    await expect(service.commitStagedAttachment(reference.contentHash)).rejects.toThrow('hash_mismatch');
    expect(await service.getAttachment(reference.contentHash)).toBeNull();
    await service.stageAttachmentChunk(reference, 0, data);
    await service.commitStagedAttachment(reference.contentHash);
    expect(await service.verifyAttachment(reference.contentHash)).toBe(true);
    await writeFile(path.join(directory, 'blobs', `${reference.contentHash.slice(7)}.blob`), new Uint8Array([7, 8, 9]));
    expect(await service.verifyAttachment(reference.contentHash)).toBe(false);
  });

  it('supports empty blobs and distinct event aliases without granting upload capabilities', async () => {
    const data = new Uint8Array(0);
    const reference = referenceFor(data);
    await service.stageAttachmentChunk(reference, 0, data);
    await service.commitStagedAttachment(reference.contentHash);
    expect(await service.readAttachmentRange(reference.contentHash, 0, chunkSize)).toEqual(data);
    const alias = { ...reference, filename: 'another.txt', mimeType: 'text/plain' };
    expect(await service.stageAttachmentChunk(alias, 0, data)).toBe(0);
    expect(await service.verifyAttachment(reference.contentHash)).toBe(true);
    expect(store.hasCommittedScope('unrelated-conversation', alias)).toBe(false);
  });

  it('accepts an authorized alias while rejecting guessed hashes and unrelated conversations', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const reference = referenceFor(data);
    await service.saveAttachment(reference, data);
    const scope = {
      ...await store.begin({ conversationId: 'allowed', filename: 'alias.txt', mimeType: 'text/plain', totalBytes: data.byteLength }),
      conversationId: 'allowed',
    };
    await store.write({ ...scope, offset: 0, data });
    const alias = await store.commit(scope);
    Reflect.set(service, 'agentInstanceRepository', {});
    Reflect.set(service, 'agentMessageRepository', {});
    const referenced = vi.spyOn(repository, 'conversationReferencesAttachment').mockResolvedValue(false);
    await expect(service.readAgentAttachmentChunk({
      conversationId: 'allowed',
      reference: alias,
      offset: 0,
      maxBytes: 3,
    })).resolves.toEqual(data);
    expect(referenced).not.toHaveBeenCalled();
    await expect(service.readAgentAttachmentChunk({
      conversationId: 'unrelated',
      reference: alias,
      offset: 0,
      maxBytes: 3,
    })).rejects.toThrow('not authorized');
    await expect(service.readAgentAttachmentChunk({
      conversationId: 'allowed',
      reference: { ...alias, filename: 'forged.txt' },
      offset: 0,
      maxBytes: 3,
    })).rejects.toThrow('not authorized');
  });

  it('restarts a corrupt unverified prefix and clears corruption beyond a matching retry', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const reference = referenceFor(data);
    await service.stageAttachmentChunk(reference, 0, new Uint8Array([9]));
    expect(await service.stageAttachmentChunk(reference, 0, data.subarray(0, 1))).toBe(1);
    await service.stageAttachmentChunk(reference, 1, new Uint8Array([9]));
    expect(await service.stageAttachmentChunk(reference, 0, data.subarray(0, 1))).toBe(2);
    await service.stageAttachmentChunk(reference, 2, data.subarray(2));
    await expect(service.commitStagedAttachment(reference.contentHash)).rejects.toThrow('hash_mismatch');
    await service.stageAttachmentChunk(reference, 0, data);
    await service.commitStagedAttachment(reference.contentHash);
    expect(await service.verifyAttachment(reference.contentHash)).toBe(true);
  });

  it('rejects conflicting chunk retries, out-of-order writes and cancelled staging', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const reference = referenceFor(data);
    await expect(service.stageAttachmentChunk(reference, 1, data.subarray(1))).rejects.toThrow('offset');
    await service.stageAttachmentChunk(reference, 0, data.subarray(0, 2));
    await expect(service.stageAttachmentChunk(reference, 1, new Uint8Array([8]))).rejects.toThrow('retry_conflict');
    await expect(service.commitStagedAttachment(reference.contentHash)).rejects.toThrow('incomplete');
    const controller = new AbortController();
    controller.abort(new Error('stop-sync'));
    await expect(service.stageAttachmentChunk(reference, 2, data.subarray(2), { signal: controller.signal })).rejects.toThrow('stop-sync');
    await service.stageAttachmentChunk(reference, 2, data.subarray(2));
    await service.commitStagedAttachment(reference.contentHash);
    expect(await service.verifyAttachment(reference.contentHash)).toBe(true);
  });
});
