import { isProviderConfigError } from './errors';

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

  // Convert error to string for analysis
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Check common error patterns
  if (errorMessage.includes('API key') && errorMessage.includes('not found')) {
    return {
      name: 'MissingAPIKeyError',
      code: 'MISSING_API_KEY',
      provider,
      message: `API key for ${provider} not found`,
    };
  } else if (errorMessage.includes('requires baseURL')) {
    return {
      name: 'MissingBaseURLError',
      code: 'MISSING_BASE_URL',
      provider,
      message: `${provider} provider requires baseURL`,
    };
  } else if (errorMessage.includes('authentication failed') || errorMessage.includes('401')) {
    return {
      name: 'AuthenticationError',
      code: 'AUTHENTICATION_FAILED',
      provider,
      message: `${provider} authentication failed: Invalid API key`,
    };
  } else if (errorMessage.includes('404')) {
    return {
      name: 'ModelNotFoundError',
      code: 'MODEL_NOT_FOUND',
      provider,
      message: `Model not found for ${provider}`,
    };
  } else if (errorMessage.includes('429')) {
    return {
      name: 'RateLimitError',
      code: 'RATE_LIMIT_EXCEEDED',
      provider,
      message: `${provider} rate limit exceeded. Reduce request frequency or check API limits.`,
    };
  }

  // Generic error
  return {
    name: 'AIProviderError',
    code: 'UNKNOWN_ERROR',
    provider,
    message: errorMessage,
  };
}
