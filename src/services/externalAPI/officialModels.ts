import { type ModelCatalogProvider, normalizeProviderAccountConfig, type ProviderAccountConfig, type ProviderModelRoute } from 'memeloop';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_PAGES = 20;

interface DiscoveryOptions {
  fetch?: typeof globalThis.fetch;
  maxBytes?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function accountBaseUrl(account: ProviderAccountConfig): string {
  if (account.baseUrl) return account.baseUrl;
  switch (account.providerType) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'deepseek':
      return 'https://api.deepseek.com/v1';
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta';
    case 'ollama':
      return 'http://localhost:11434';
    default:
      throw new Error(`Provider ${account.providerId} requires an explicit baseUrl for model discovery`);
  }
}

function assertSafeUrl(value: string): URL {
  const url = new URL(value);
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Official model discovery requires HTTPS except for loopback providers');
  }
  return url;
}

function endpoint(
  account: ProviderAccountConfig,
  apiKey: string,
  pageToken?: string,
): { headers: Headers; url: URL } {
  const root = assertSafeUrl(accountBaseUrl(account).replace(/\/+$/, ''));
  const headers = new Headers({ accept: 'application/json' });
  if (account.providerType === 'ollama') {
    return { headers, url: new URL(`${root.toString().replace(/\/$/, '')}/api/tags`) };
  }
  if (!apiKey.trim()) throw new Error(`API key is required to discover ${account.providerId} models`);
  if (account.providerType === 'anthropic') {
    headers.set('x-api-key', apiKey);
    headers.set('anthropic-version', '2023-06-01');
    const url = new URL(`${root.toString().replace(/\/$/, '')}/models`);
    url.searchParams.set('limit', '1000');
    if (pageToken) url.searchParams.set('after_id', pageToken);
    return { headers, url };
  }
  if (account.providerType === 'google') {
    const url = new URL(`${root.toString().replace(/\/$/, '')}/models`);
    headers.set('x-goog-api-key', apiKey);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    return { headers, url };
  }
  headers.set('authorization', `Bearer ${apiKey}`);
  return { headers, url: new URL(`${root.toString().replace(/\/$/, '')}/models`) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readBoundedResponse(response: Response, remainingBytes: number): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > remainingBytes) {
    throw new Error('Official model response exceeds the size limit');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > remainingBytes) {
        await reader.cancel('Official model response exceeds the size limit');
        throw new Error('Official model response exceeds the size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function modelPage(
  account: ProviderAccountConfig,
  value: unknown,
): { ids: string[]; nextPageToken?: string } {
  if (!isRecord(value)) throw new TypeError('Provider model response must be an object');
  const entries = account.providerType === 'ollama' || account.providerType === 'google'
    ? value.models
    : value.data;
  if (!Array.isArray(entries)) throw new TypeError('Provider model response has no model list');
  const ids = entries.flatMap((entry): string[] => {
    if (!isRecord(entry)) return [];
    const candidate = account.providerType === 'ollama' || account.providerType === 'google'
      ? entry.name
      : entry.id;
    if (typeof candidate !== 'string' || candidate.trim() === '') return [];
    return [account.providerType === 'google' ? candidate.replace(/^models\//, '') : candidate];
  });
  const nextPageToken = account.providerType === 'anthropic'
    ? value.has_more === true && typeof value.last_id === 'string' ? value.last_id : undefined
    : account.providerType === 'google' && typeof value.nextPageToken === 'string'
    ? value.nextPageToken
    : undefined;
  return { ids: [...new Set(ids)].sort(), ...(nextPageToken ? { nextPageToken } : {}) };
}

export async function discoverOfficialModelIds(
  account: ProviderAccountConfig,
  apiKey: string,
  options: DiscoveryOptions = {},
): Promise<string[]> {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => {
    timeoutController.abort(new Error('Official model discovery timed out'));
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;
  try {
    const ids: string[] = [];
    let pageToken: string | undefined;
    let totalBytes = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const request = endpoint(account, apiKey, pageToken);
      const response = await fetchImplementation(request.url.toString(), {
        headers: request.headers,
        redirect: 'error',
        signal,
      });
      if (!response.ok) throw new Error(`Official model discovery failed with HTTP ${response.status}`);
      const bytes = await readBoundedResponse(response, maxBytes - totalBytes);
      totalBytes += bytes.byteLength;
      const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const result = modelPage(account, payload);
      ids.push(...result.ids);
      if (!result.nextPageToken) return [...new Set(ids)].sort();
      pageToken = result.nextPageToken;
    }
    throw new Error(`Official model discovery exceeded ${MAX_PAGES} pages`);
  } finally {
    clearTimeout(timeout);
  }
}

export function mergeDiscoveredProviderRoutes(
  account: ProviderAccountConfig,
  discoveredIds: readonly string[],
  catalogProvider?: ModelCatalogProvider,
): Readonly<ProviderAccountConfig> {
  const routes = new Map(account.models.map(route => [route.modelId, route]));
  for (const modelId of [...new Set(discoveredIds)].sort()) {
    if (modelId.trim() === '' || routes.has(modelId)) continue;
    const route: ProviderModelRoute = {
      modelId,
      wireModelId: modelId,
      apiMode: account.providerType === 'openai' ? 'responses' : 'chat-completions',
    };
    routes.set(modelId, route);
  }
  return normalizeProviderAccountConfig({
    ...account,
    models: [...routes.values()],
    ...(catalogProvider === undefined ? {} : { catalogProvider }),
  });
}
