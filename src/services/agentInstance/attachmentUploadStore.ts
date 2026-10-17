import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, type FileHandle, link, mkdir, open, opendir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AttachmentReference } from 'memeloop';
import {
  type BeginDesktopAttachmentUploadInput,
  DESKTOP_ATTACHMENT_UPLOAD_LIMITS,
  type DesktopAttachmentUploadScope,
  type WriteDesktopAttachmentChunkInput,
} from './attachmentUploadProtocol';

export {
  type BeginDesktopAttachmentUploadInput,
  DESKTOP_ATTACHMENT_UPLOAD_LIMITS,
  type DesktopAttachmentUploadScope,
  type WriteDesktopAttachmentChunkInput,
} from './attachmentUploadProtocol';

interface ActiveUpload {
  uploadId: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  totalBytes: number;
  expectedSha256?: string;
  receivedBytes: number;
  hash: ReturnType<typeof createHash>;
  handle: FileHandle;
  temporaryPath: string;
  closed: boolean;
  operation: Promise<void>;
}

interface AttachmentMetadata extends AttachmentReference {
  version: 1;
}

const SHA256 = /^(?:sha256:)?([0-9a-f]{64})$/u;
const encoder = new TextEncoder();

/** Main-process content-addressed attachment staging. */
export class DesktopAttachmentUploadStore {
  private readonly active = new Map<string, ActiveUpload>();
  private readonly committedUploads = new Map<string, { conversationId: string; reference: AttachmentReference }>();
  private readonly blobDirectory: string;
  private readonly temporaryDirectory: string;
  private readonly metadataDirectory: string;
  private readonly syncDirectory: string;
  private readonly syncLocks = new Map<string, Promise<void>>();
  private initialization: Promise<void> | undefined;

  public constructor(rootDirectory: string) {
    if (!path.isAbsolute(rootDirectory)) throw new TypeError('attachment root must be absolute');
    this.blobDirectory = path.join(rootDirectory, 'blobs');
    this.temporaryDirectory = path.join(rootDirectory, 'staging');
    this.metadataDirectory = path.join(rootDirectory, 'metadata');
    this.syncDirectory = path.join(rootDirectory, 'sync-staging');
  }

  public async initialize(): Promise<void> {
    this.initialization ??= (async () => {
      await Promise.all([
        mkdir(this.blobDirectory, { recursive: true, mode: 0o700 }),
        mkdir(this.temporaryDirectory, { recursive: true, mode: 0o700 }),
        mkdir(this.metadataDirectory, { recursive: true, mode: 0o700 }),
        mkdir(this.syncDirectory, { recursive: true, mode: 0o700 }),
      ]);
      await this.cleanupStaleTemporaryFiles();
    })();
    return this.initialization;
  }

  public async begin(input: BeginDesktopAttachmentUploadInput, options?: { signal?: AbortSignal }): Promise<{ uploadId: string }> {
    options?.signal?.throwIfAborted();
    assertIdentifier(input.conversationId, 'conversationId');
    assertText(input.filename, 'filename', DESKTOP_ATTACHMENT_UPLOAD_LIMITS.filenameBytes);
    assertText(input.mimeType, 'mimeType', DESKTOP_ATTACHMENT_UPLOAD_LIMITS.mimeTypeBytes);
    if (!Number.isSafeInteger(input.totalBytes) || input.totalBytes < 0 || input.totalBytes > DESKTOP_ATTACHMENT_UPLOAD_LIMITS.totalBytes) {
      throw new RangeError('attachment total size is invalid');
    }
    const expectedSha256 = input.sha256 === undefined ? undefined : normalizeSha256(input.sha256);
    await this.initialize();
    options?.signal?.throwIfAborted();
    const uploadId = randomUUID();
    const temporaryPath = path.join(this.temporaryDirectory, `${uploadId}.part`);
    const handle = await open(temporaryPath, 'wx', 0o600);
    const upload: ActiveUpload = {
      uploadId,
      conversationId: input.conversationId,
      filename: input.filename,
      mimeType: input.mimeType,
      totalBytes: input.totalBytes,
      expectedSha256,
      receivedBytes: 0,
      hash: createHash('sha256'),
      handle,
      temporaryPath,
      closed: false,
      operation: Promise.resolve(),
    };
    this.active.set(uploadId, upload);
    if (options?.signal?.aborted) {
      await this.abort({ uploadId, conversationId: input.conversationId });
      options.signal.throwIfAborted();
    }
    return { uploadId };
  }

  public async write(input: WriteDesktopAttachmentChunkInput, options?: { signal?: AbortSignal }): Promise<{ nextOffset: number }> {
    options?.signal?.throwIfAborted();
    return this.withUploadLock(input, async () => {
      options?.signal?.throwIfAborted();
      const upload = this.requireUpload(input);
      if (!(input.data instanceof Uint8Array) || input.data.byteLength < 1 || input.data.byteLength > DESKTOP_ATTACHMENT_UPLOAD_LIMITS.chunkBytes) {
        throw new RangeError('attachment chunk size is invalid');
      }
      if (input.offset !== upload.receivedBytes || input.offset + input.data.byteLength > upload.totalBytes) {
        throw new RangeError('attachment chunk offset is invalid');
      }
      const { bytesWritten } = await upload.handle.write(input.data, 0, input.data.byteLength, input.offset);
      if (bytesWritten !== input.data.byteLength) {
        await this.releaseActiveUpload(upload);
        throw new Error('attachment chunk write was incomplete');
      }
      upload.hash.update(input.data);
      upload.receivedBytes += bytesWritten;
      if (options?.signal?.aborted) {
        await this.releaseActiveUpload(upload);
        options.signal.throwIfAborted();
      }
      return { nextOffset: upload.receivedBytes };
    });
  }

  public async commit(scope: DesktopAttachmentUploadScope, options?: { signal?: AbortSignal }): Promise<AttachmentReference> {
    options?.signal?.throwIfAborted();
    return this.withUploadLock(scope, async () => {
      options?.signal?.throwIfAborted();
      const upload = this.requireUpload(scope);
      if (upload.receivedBytes !== upload.totalBytes) throw new Error('attachment upload is incomplete');
      const digest = upload.hash.digest('hex');
      upload.closed = true;
      try {
        await upload.handle.sync();
        await upload.handle.close();
        if (upload.expectedSha256 !== undefined && upload.expectedSha256 !== digest) {
          throw new Error('attachment sha256 mismatch');
        }
        options?.signal?.throwIfAborted();
        const reference: AttachmentReference = Object.freeze({
          contentHash: `sha256:${digest}`,
          filename: upload.filename,
          mimeType: upload.mimeType,
          size: upload.totalBytes,
        });
        await this.publishTemporaryBlob(upload.temporaryPath, digest, upload.totalBytes);
        options?.signal?.throwIfAborted();
        await this.writeMetadata(reference);
        options?.signal?.throwIfAborted();
        this.committedUploads.set(upload.uploadId, {
          conversationId: upload.conversationId,
          reference,
        });
        return reference;
      } finally {
        this.active.delete(upload.uploadId);
        await upload.handle.close().catch(() => undefined);
        await unlink(upload.temporaryPath).catch(() => undefined);
      }
    });
  }

  public async abort(scope: DesktopAttachmentUploadScope): Promise<void> {
    const upload = this.active.get(scope.uploadId);
    if (!upload) {
      this.abortCommittedUpload(scope);
      return;
    }
    if (upload.conversationId !== scope.conversationId) throw new Error('attachment upload scope mismatch');
    await this.withUploadLock(scope, async () => {
      const active = this.active.get(scope.uploadId);
      if (!active) {
        this.abortCommittedUpload(scope);
        return;
      }
      await this.releaseActiveUpload(active);
    });
  }

  /**
   * Revoke all ephemeral upload capabilities owned by one conversation. The
   * content-addressed blobs are deliberately retained because another synced
   * conversation may reference the same hash.
   */
  public async releaseConversationScope(conversationId: string): Promise<void> {
    assertIdentifier(conversationId, 'conversationId');
    const activeUploads = [...this.active.values()].filter(upload => upload.conversationId === conversationId);
    await Promise.all(activeUploads.map(upload => this.abort({ uploadId: upload.uploadId, conversationId })));
    for (const [uploadId, committed] of this.committedUploads) {
      if (committed.conversationId === conversationId) this.committedUploads.delete(uploadId);
    }
  }

  /** One-shot authorization for attaching a newly committed upload to its scoped conversation. */
  public consumeCommittedScope(conversationId: string, reference: AttachmentReference): boolean {
    for (const [uploadId, committed] of this.committedUploads) {
      if (committed.conversationId === conversationId && referencesEqual(committed.reference, reference)) {
        this.committedUploads.delete(uploadId);
        return true;
      }
    }
    return false;
  }

  /** Non-consuming authorization check for a bounded remote-forwarding read. */
  public hasCommittedScope(conversationId: string, reference: AttachmentReference): boolean {
    for (const committed of this.committedUploads.values()) {
      if (committed.conversationId === conversationId && referencesEqual(committed.reference, reference)) return true;
    }
    return false;
  }

  public async getReference(contentHash: string, options?: { signal?: AbortSignal }): Promise<AttachmentReference | null> {
    options?.signal?.throwIfAborted();
    const digest = normalizeSha256(contentHash);
    try {
      const metadata = JSON.parse(await readFile(this.metadataPath(digest), 'utf8')) as unknown;
      const reference = parseMetadata(metadata, digest);
      await access(this.blobPath(digest), constants.R_OK);
      options?.signal?.throwIfAborted();
      return reference;
    } catch {
      options?.signal?.throwIfAborted();
      return null;
    }
  }

  public async readRange(contentHash: string, offset: number, maxBytes: number, options?: { signal?: AbortSignal }): Promise<Uint8Array | null> {
    return this.readBoundedRange(contentHash, offset, maxBytes, DESKTOP_ATTACHMENT_UPLOAD_LIMITS.chunkBytes, false, options);
  }

  public async readSyncRange(contentHash: string, offset: number, maxBytes: number, options?: { signal?: AbortSignal }): Promise<Uint8Array | null> {
    return this.readBoundedRange(contentHash, offset, maxBytes, 3 * 1024 * 1024, true, options);
  }

  private async readBoundedRange(
    contentHash: string,
    offset: number,
    maxBytes: number,
    limit: number,
    emptyAtEnd: boolean,
    options?: { signal?: AbortSignal },
  ): Promise<Uint8Array | null> {
    options?.signal?.throwIfAborted();
    const reference = await this.getReference(contentHash, options);
    if (!reference) return null;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > limit) {
      throw new RangeError('attachment range is invalid');
    }
    if (offset >= reference.size) return emptyAtEnd && offset === reference.size ? new Uint8Array(0) : null;
    const handle = await open(this.blobPath(normalizeSha256(contentHash)), 'r');
    try {
      const data = new Uint8Array(Math.min(maxBytes, reference.size - offset));
      const { bytesRead } = await handle.read(data, 0, data.byteLength, offset);
      options?.signal?.throwIfAborted();
      return bytesRead === 0 ? null : data.slice(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  public async verifyAttachment(contentHash: string, options?: { signal?: AbortSignal }): Promise<boolean> {
    const reference = await this.getReference(contentHash, options);
    return reference !== null && await this.verifyFile(this.blobPath(normalizeSha256(contentHash)), reference, options);
  }

  /** Durable sync staging is independent of ephemeral renderer upload capabilities. */
  public async stageSyncChunk(reference: AttachmentReference, offset: number, data: Uint8Array, options?: { signal?: AbortSignal }): Promise<number> {
    const digest = normalizeSha256(reference.contentHash);
    parseMetadata({ ...reference, contentHash: `sha256:${digest}`, version: 1 }, digest);
    if (
      reference.size > DESKTOP_ATTACHMENT_UPLOAD_LIMITS.totalBytes ||
      !Number.isSafeInteger(offset) || offset < 0 || !(data instanceof Uint8Array) ||
      data.byteLength > 3 * 1024 * 1024 || offset + data.byteLength > reference.size ||
      (data.byteLength === 0 && reference.size !== 0)
    ) throw new Error('invalid_attachment_chunk');
    await this.initialize();
    return this.withSyncLock(digest, async () => {
      options?.signal?.throwIfAborted();
      const published = await this.getReference(reference.contentHash, options);
      if (published) {
        if (published.size !== reference.size) throw new Error('attachment_reference_conflict');
        return published.size;
      }
      const metadataPath = path.join(this.syncDirectory, `${digest}.json`);
      const temporaryMetadataPath = path.join(this.temporaryDirectory, `${randomUUID()}.json`);
      await writeFile(temporaryMetadataPath, JSON.stringify({ ...reference, contentHash: `sha256:${digest}`, version: 1 }), { flag: 'wx', mode: 0o600 });
      try {
        await link(temporaryMetadataPath, metadataPath).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        });
      } finally {
        await unlink(temporaryMetadataPath).catch(() => undefined);
      }
      const stagedReference = parseMetadata(JSON.parse(await readFile(metadataPath, 'utf8')) as unknown, digest);
      if (stagedReference.size !== reference.size) throw new Error('attachment_reference_conflict');
      const stagedPath = path.join(this.syncDirectory, `${digest}.part`);
      const handle = await open(stagedPath, 'wx+', 0o600).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        return open(stagedPath, 'r+');
      });
      try {
        let durableOffset = (await handle.stat()).size;
        if (durableOffset > reference.size || offset > durableOffset) throw new Error('attachment_chunk_offset_mismatch');
        let overlap = Math.min(data.byteLength, durableOffset - offset);
        if (overlap > 0) {
          const prior = new Uint8Array(overlap);
          const { bytesRead } = await handle.read(prior, 0, overlap, offset);
          if (bytesRead !== overlap || !Buffer.from(prior).equals(data.subarray(0, overlap))) {
            if (offset !== 0) throw new Error('attachment_chunk_retry_conflict');
            // Restart only unverified staging; the final hash still gates publication.
            await handle.truncate(0);
            durableOffset = 0;
            overlap = 0;
          }
        }
        let written = overlap;
        while (written < data.byteLength) {
          options?.signal?.throwIfAborted();
          const result = await handle.write(data, written, data.byteLength - written, offset + written);
          if (result.bytesWritten === 0) throw new Error('attachment_chunk_write_failed');
          written += result.bytesWritten;
        }
        await handle.sync();
        options?.signal?.throwIfAborted();
        return Math.max(durableOffset, offset + data.byteLength);
      } finally {
        await handle.close();
      }
    });
  }

  public async commitSyncAttachment(contentHash: string, options?: { signal?: AbortSignal }): Promise<void> {
    const digest = normalizeSha256(contentHash);
    await this.initialize();
    await this.withSyncLock(digest, async () => {
      options?.signal?.throwIfAborted();
      if (await this.getReference(contentHash, options)) {
        if (!await this.verifyAttachment(contentHash, options)) throw new Error('attachment_hash_mismatch');
        return;
      }
      const stagedPath = path.join(this.syncDirectory, `${digest}.part`);
      const metadataPath = path.join(this.syncDirectory, `${digest}.json`);
      const reference = parseMetadata(JSON.parse(await readFile(metadataPath, 'utf8')) as unknown, digest);
      if ((await stat(stagedPath)).size !== reference.size) throw new Error('attachment_incomplete');
      if (!await this.verifyFile(stagedPath, reference, options)) {
        await unlink(stagedPath);
        await unlink(metadataPath);
        throw new Error('attachment_hash_mismatch');
      }
      options?.signal?.throwIfAborted();
      await this.publishTemporaryBlob(stagedPath, digest, reference.size);
      await this.writeMetadata(reference);
      await unlink(stagedPath);
      await unlink(metadataPath);
    });
  }

  private async verifyFile(file: string, reference: AttachmentReference, options?: { signal?: AbortSignal }): Promise<boolean> {
    options?.signal?.throwIfAborted();
    const handle = await open(file, 'r');
    try {
      if ((await handle.stat()).size !== reference.size) return false;
      const hash = createHash('sha256');
      const buffer = new Uint8Array(DESKTOP_ATTACHMENT_UPLOAD_LIMITS.chunkBytes);
      let offset = 0;
      while (offset < reference.size) {
        options?.signal?.throwIfAborted();
        const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.byteLength, reference.size - offset), offset);
        if (bytesRead === 0) return false;
        hash.update(buffer.subarray(0, bytesRead));
        offset += bytesRead;
      }
      options?.signal?.throwIfAborted();
      return hash.digest('hex') === normalizeSha256(reference.contentHash);
    } finally {
      await handle.close();
    }
  }

  private async withSyncLock<T>(digest: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.syncLocks.get(digest) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const settled = result.then(() => undefined, () => undefined);
    this.syncLocks.set(digest, settled);
    try {
      return await result;
    } finally {
      if (this.syncLocks.get(digest) === settled) this.syncLocks.delete(digest);
    }
  }

  public async save(reference: AttachmentReference, data: Uint8Array, options?: { signal?: AbortSignal }): Promise<void> {
    options?.signal?.throwIfAborted();
    if (!(data instanceof Uint8Array) || data.byteLength !== reference.size || data.byteLength > DESKTOP_ATTACHMENT_UPLOAD_LIMITS.totalBytes) {
      throw new RangeError('attachment blob size mismatch');
    }
    const digest = normalizeSha256(reference.contentHash);
    const actualDigest = createHash('sha256').update(data).digest('hex');
    if (actualDigest !== digest) throw new Error('attachment sha256 mismatch');
    await this.initialize();
    const temporaryPath = path.join(this.temporaryDirectory, `${randomUUID()}.part`);
    await writeFile(temporaryPath, data, { flag: 'wx', mode: 0o600 });
    try {
      options?.signal?.throwIfAborted();
      await this.publishTemporaryBlob(temporaryPath, digest, data.byteLength);
      await this.writeMetadata(reference);
      options?.signal?.throwIfAborted();
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  public async dispose(): Promise<void> {
    await Promise.all([...this.active.values()].map(upload => this.abort(upload)));
    this.committedUploads.clear();
  }

  private requireUpload(scope: DesktopAttachmentUploadScope): ActiveUpload {
    assertIdentifier(scope.uploadId, 'uploadId');
    assertIdentifier(scope.conversationId, 'conversationId');
    const upload = this.active.get(scope.uploadId);
    if (!upload || upload.closed) throw new Error('attachment upload is unavailable');
    if (upload.conversationId !== scope.conversationId) throw new Error('attachment upload scope mismatch');
    return upload;
  }

  /** Serialize all stateful operations for one untrusted renderer capability. */
  private async withUploadLock<T>(scope: DesktopAttachmentUploadScope, operation: () => Promise<T>): Promise<T> {
    const upload = this.requireUpload(scope);
    let release!: () => void;
    const next = new Promise<void>(resolve => {
      release = resolve;
    });
    const previous = upload.operation;
    upload.operation = next;
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async releaseActiveUpload(upload: ActiveUpload): Promise<void> {
    this.active.delete(upload.uploadId);
    if (!upload.closed) {
      upload.closed = true;
      await upload.handle.close().catch(() => undefined);
    }
    await unlink(upload.temporaryPath).catch(() => undefined);
  }

  private abortCommittedUpload(scope: DesktopAttachmentUploadScope): void {
    const committed = this.committedUploads.get(scope.uploadId);
    if (!committed) return;
    if (committed.conversationId !== scope.conversationId) throw new Error('attachment upload scope mismatch');
    this.committedUploads.delete(scope.uploadId);
  }

  private async publishTemporaryBlob(temporaryPath: string, digest: string, expectedSize: number): Promise<void> {
    const finalPath = this.blobPath(digest);
    try {
      await link(temporaryPath, finalPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if ((await stat(finalPath)).size !== expectedSize) throw new Error('attachment content-address collision');
    }
  }

  private async writeMetadata(reference: AttachmentReference): Promise<AttachmentReference> {
    const digest = normalizeSha256(reference.contentHash);
    const finalPath = this.metadataPath(digest);
    try {
      await access(finalPath, constants.F_OK);
      const existing = await this.getReference(reference.contentHash);
      if (!existing || existing.size !== reference.size) throw new Error('attachment metadata collision');
      return existing;
    } catch (error) {
      if (error instanceof Error && error.message === 'attachment metadata collision') throw error;
    }
    const temporaryPath = path.join(this.temporaryDirectory, `${randomUUID()}.json`);
    const metadata: AttachmentMetadata = { version: 1, ...reference };
    await writeFile(temporaryPath, JSON.stringify(metadata), { flag: 'wx', mode: 0o600 });
    try {
      try {
        await link(temporaryPath, finalPath);
        return reference;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const existing = await this.getReference(reference.contentHash);
        if (!existing || existing.size !== reference.size) throw new Error('attachment metadata collision');
        return existing;
      }
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  private blobPath(digest: string): string {
    return path.join(this.blobDirectory, `${digest}.blob`);
  }

  private metadataPath(digest: string): string {
    return path.join(this.metadataDirectory, `${digest}.json`);
  }

  private async cleanupStaleTemporaryFiles(): Promise<void> {
    const cutoff = Date.now() - 60 * 60 * 1000;
    const directory = await opendir(this.temporaryDirectory);
    let inspected = 0;
    try {
      for await (const entry of directory) {
        if (inspected >= 2_048) break;
        inspected += 1;
        if (!entry.isFile() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:part|json)$/u.test(entry.name)) {
          continue;
        }
        const candidate = path.join(this.temporaryDirectory, entry.name);
        const stats = await stat(candidate).catch(() => undefined);
        if (stats?.isFile() && stats.mtimeMs < cutoff) await unlink(candidate).catch(() => undefined);
      }
    } finally {
      await directory.close().catch(() => undefined);
    }
  }
}

function referencesEqual(left: AttachmentReference, right: AttachmentReference): boolean {
  return left.contentHash === right.contentHash && left.filename === right.filename &&
    left.mimeType === right.mimeType && left.size === right.size;
}

function normalizeSha256(value: string): string {
  const match = SHA256.exec(value);
  if (!match) throw new TypeError('invalid attachment sha256');
  return match[1];
}

function assertText(value: string, field: string, maxBytes: number): void {
  if (typeof value !== 'string' || value.length === 0 || encoder.encode(value).byteLength > maxBytes || hasControlCharacters(value)) {
    throw new TypeError(`invalid attachment ${field}`);
  }
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x1F || codePoint === 0x7F) return true;
  }
  return false;
}

function assertIdentifier(value: string, field: string): void {
  assertText(value, field, 8 * 1024);
}

function parseMetadata(value: unknown, digest: string): AttachmentReference {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid attachment metadata');
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(key => !['version', 'contentHash', 'filename', 'mimeType', 'size'].includes(key)) ||
    record.version !== 1 || record.contentHash !== `sha256:${digest}` || typeof record.filename !== 'string' ||
    typeof record.mimeType !== 'string' || !Number.isSafeInteger(record.size) || (record.size as number) < 0
  ) throw new TypeError('invalid attachment metadata');
  assertText(record.filename, 'filename', DESKTOP_ATTACHMENT_UPLOAD_LIMITS.filenameBytes);
  assertText(record.mimeType, 'mimeType', DESKTOP_ATTACHMENT_UPLOAD_LIMITS.mimeTypeBytes);
  return Object.freeze({
    contentHash: record.contentHash,
    filename: record.filename,
    mimeType: record.mimeType,
    size: record.size as number,
  });
}
