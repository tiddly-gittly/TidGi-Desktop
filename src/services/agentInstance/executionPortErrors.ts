export const DESKTOP_AGENT_EXECUTION_PORT_ERROR_CODES = Object.freeze(
  [
    'MODEL_SELECTION_NOT_CONFIGURED',
  ] as const,
);

export type DesktopAgentExecutionPortErrorCode = typeof DESKTOP_AGENT_EXECUTION_PORT_ERROR_CODES[number];

/**
 * Stable main-to-renderer execution boundary error. Only the bounded machine
 * code crosses Electron IPC; provider details and credentials never do.
 */
export class DesktopAgentExecutionPortError extends Error {
  public constructor(public readonly code: DesktopAgentExecutionPortErrorCode) {
    super(`desktop_agent_execution_${code.toLowerCase()}`);
    this.name = 'DesktopAgentExecutionPortError';
  }
}

/** Read only an own, primitive IPC-safe code instead of parsing error text. */
export function extractDesktopAgentExecutionPortErrorCode(value: unknown): DesktopAgentExecutionPortErrorCode | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, 'code');
  if (!descriptor || !('value' in descriptor)) return undefined;
  return DESKTOP_AGENT_EXECUTION_PORT_ERROR_CODES.includes(descriptor.value as DesktopAgentExecutionPortErrorCode)
    ? descriptor.value as DesktopAgentExecutionPortErrorCode
    : undefined;
}
