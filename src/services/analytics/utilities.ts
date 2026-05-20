const ERROR_MESSAGE_MAX_LENGTH = 100;

/**
 * Extract a privacy-safe summary from an Error for analytics.
 * Strips file paths and truncates, keeping only the error name and the beginning of the message.
 */
export function sanitizeErrorMessage(error: Error): string {
  const firstLine = (error.stack ?? error.message ?? '').split('\n')[0] ?? '';
  let cleaned = firstLine.replace(/\s+at\s+.*$/i, '');
  cleaned = cleaned.replace(/\s*\([^)]*(?:file:\/\/|[a-zA-Z]:\\|\/)[^)]*\)/g, '');
  return cleaned.trim().slice(0, ERROR_MESSAGE_MAX_LENGTH);
}
