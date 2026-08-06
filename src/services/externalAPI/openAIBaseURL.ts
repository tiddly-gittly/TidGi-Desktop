export function normalizeOpenAIBaseURL(value: string): string {
  const url = new URL(value.trim());
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path === '' ? '/v1' : path;
  return url.toString().replace(/\/$/, '');
}

export function isLoopbackOpenAIBaseURL(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '[::1]' || hostname.startsWith('127.');
  } catch {
    return false;
  }
}
