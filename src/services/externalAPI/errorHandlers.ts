import { isProviderConfigError, parseProviderError } from './errors';

/**
 * Extract structured error details from various error types
 */
export function extractErrorDetails(error: unknown, providerId: string): {
  name: string;
  code: string;
  providerId: string;
  message?: string;
} {
  // Check if it's already a known provider error type
  if (isProviderConfigError(error)) {
    return {
      name: error.name,
      code: error.code,
      providerId: error.providerId,
      message: error.message,
    };
  }

  const normalized = parseProviderError(error, providerId);
  if (isProviderConfigError(normalized)) {
    return {
      name: normalized.name,
      code: normalized.code,
      providerId: normalized.providerId,
      message: normalized.message,
    };
  }

  // Never relay an arbitrary SDK/upstream body to renderers. Agent runs turn
  // this stable code into Core's localized error + diagnosticId contract.
  return {
    name: 'AIProviderError',
    code: 'UNKNOWN_ERROR',
    providerId,
    message: 'Chat.ConfigError.ProviderUnavailable',
  };
}
