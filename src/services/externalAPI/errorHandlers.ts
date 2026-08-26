import { isProviderConfigError, parseProviderError } from './errors';

/**
 * Extract structured error details from various error types
 */
export function extractErrorDetails(error: unknown, provider: string): {
  name: string;
  code: string;
  provider: string;
  message?: string;
} {
  // Check if it's already a known provider error type
  if (isProviderConfigError(error)) {
    return {
      name: error.name,
      code: error.code,
      provider: error.provider,
      message: error.message,
    };
  }

  const normalized = parseProviderError(error, provider);
  if (isProviderConfigError(normalized)) {
    return {
      name: normalized.name,
      code: normalized.code,
      provider: normalized.provider,
      message: normalized.message,
    };
  }

  // Never relay an arbitrary SDK/upstream body to renderers. Agent runs turn
  // this stable code into Core's localized error + diagnosticId contract.
  return {
    name: 'AIProviderError',
    code: 'UNKNOWN_ERROR',
    provider,
    message: 'Chat.ConfigError.ProviderUnavailable',
  };
}
