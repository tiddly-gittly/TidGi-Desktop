export interface SecureBrowserRandomSource {
  getRandomValues?(array: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
  randomUUID?(): string;
}

/**
 * Generate an RFC 4122 version 4 UUID without falling back to predictable
 * randomness. Some Electron custom-scheme renderers expose getRandomValues()
 * but omit randomUUID().
 */
export function createSecureBrowserUuid(source: SecureBrowserRandomSource | undefined = globalThis.crypto): string {
  if (typeof source?.randomUUID === 'function') return source.randomUUID();
  if (typeof source?.getRandomValues !== 'function') throw new Error('secure_request_id_unavailable');

  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hexadecimal = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));
  return `${hexadecimal.slice(0, 4).join('')}-${hexadecimal.slice(4, 6).join('')}-${hexadecimal.slice(6, 8).join('')}-${hexadecimal.slice(8, 10).join('')}-${
    hexadecimal.slice(10).join('')
  }`;
}
