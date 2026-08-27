import { describe, expect, it, vi } from 'vitest';

import { createSecureBrowserUuid } from '../createSecureBrowserUuid';

describe('createSecureBrowserUuid', () => {
  it('prefers the native randomUUID implementation', () => {
    const randomUUID = vi.fn(() => '3d7d2ac1-f7bc-4ab2-a362-186b3f738156');

    expect(createSecureBrowserUuid({ randomUUID })).toBe('3d7d2ac1-f7bc-4ab2-a362-186b3f738156');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('builds a version 4 variant 1 UUID from cryptographic random bytes', () => {
    const getRandomValues = vi.fn((array: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
      array.set(Array.from({ length: 16 }, (_, index) => index));
      return array;
    });

    expect(createSecureBrowserUuid({ getRandomValues })).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it('fails closed when no secure random source exists', () => {
    expect(() => createSecureBrowserUuid({})).toThrow('secure_request_id_unavailable');
  });
});
