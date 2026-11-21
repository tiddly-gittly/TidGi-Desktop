/** Filesystem errors originate outside the TiddlyWiki plugin's VM realm. */
export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Error.isError(error) && 'code' in error && typeof error.code === 'string';
}

/**
 * Check if error is a file lock error that should be retried
 */
export function isFileLockError(errorCode: string | undefined): boolean {
  return errorCode === 'EBUSY' || errorCode === 'EPERM' || errorCode === 'EACCES' || errorCode === 'EAGAIN';
}
