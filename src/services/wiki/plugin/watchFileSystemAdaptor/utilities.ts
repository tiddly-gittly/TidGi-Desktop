/**
 * Check if error is a file lock error that should be retried
 */
export function isFileLockError(errorCode: string | undefined): boolean {
  return errorCode === 'EBUSY' || errorCode === 'EPERM' || errorCode === 'EACCES' || errorCode === 'EAGAIN';
}
