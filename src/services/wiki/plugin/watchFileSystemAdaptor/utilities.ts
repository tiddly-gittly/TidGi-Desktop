import nsfw from 'nsfw';

/**
 * Get human-readable action name from nsfw action code
 */
export function getActionName(action: number): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (action === nsfw.actions.CREATED) {
    return 'add';
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (action === nsfw.actions.DELETED) {
    return 'unlink';
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (action === nsfw.actions.MODIFIED) {
    return 'change';
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (action === nsfw.actions.RENAMED) {
    return 'rename';
  }
  return 'unknown';
}

/**
 * Check if error is a file lock error that should be retried
 */
export function isFileLockError(errorCode: string | undefined): boolean {
  return errorCode === 'EBUSY' || errorCode === 'EPERM' || errorCode === 'EACCES' || errorCode === 'EAGAIN';
}
