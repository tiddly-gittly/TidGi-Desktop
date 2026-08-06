export function normalizeOpenAIBaseURL(value: string): string {
  const url = new URL(value.trim());
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path === '' ? '/v1' : path;
  return url.toString().replace(/\/$/, '');
}
