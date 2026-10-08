/**
 * Base class for provider configuration errors
 */
export class ProviderConfigError extends Error {
  /**
   * Error code to help frontend identify the type of error
   */
  code: string;

  /**
   * Provider name that has the configuration issue
   */
  providerId: string;

  constructor(message: string, code: string, providerId: string) {
    super(message);
    this.name = 'ProviderConfigError';
    this.code = code;
    this.providerId = providerId;

    // Ensure instanceof works properly
    Object.setPrototypeOf(this, ProviderConfigError.prototype);
  }

  /**
   * Serialize to JSON for passing through IPC
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      providerId: this.providerId,
    };
  }
}

/**
 * Error for missing API key
 */
export class MissingAPIKeyError extends ProviderConfigError {
  constructor(providerId: string) {
    super(
      `API key for ${providerId} not found`,
      'MISSING_API_KEY',
      providerId,
    );
    this.name = 'MissingAPIKeyError';

    // Ensure instanceof works properly
    Object.setPrototypeOf(this, MissingAPIKeyError.prototype);
  }
}

/**
 * Error for missing base URL
 */
export class MissingBaseURLError extends ProviderConfigError {
  constructor(providerId: string) {
    super(
      `${providerId} provider requires a base URL`,
      'MISSING_BASE_URL',
      providerId,
    );
    this.name = 'MissingBaseURLError';

    // Ensure instanceof works properly
    Object.setPrototypeOf(this, MissingBaseURLError.prototype);
  }
}

/**
 * Error for authentication failure
 */
export class AuthenticationError extends ProviderConfigError {
  constructor(providerId: string) {
    super(
      `${providerId} authentication failed: Invalid API key`,
      'AUTHENTICATION_FAILED',
      providerId,
    );
    this.name = 'AuthenticationError';

    // Ensure instanceof works properly
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Check if an error is a ProviderConfigError
 */
export function isProviderConfigError(error: unknown): error is ProviderConfigError {
  return Boolean(error) &&
    typeof error === 'object' &&
    (error instanceof ProviderConfigError ||
      (error as (ProviderConfigError | undefined))?.name === 'ProviderConfigError' ||
      (error as (ProviderConfigError | undefined))?.name === 'MissingAPIKeyError' ||
      (error as (ProviderConfigError | undefined))?.name === 'MissingBaseURLError' ||
      (error as (ProviderConfigError | undefined))?.name === 'AuthenticationError');
}

/**
 * Extract the structured HTTP status exposed by AI SDK/provider errors.
 * Provider response bodies and human-language messages are deliberately not
 * parsed: they are untrusted, unstable and may contain secrets.
 */
export function getProviderHttpStatus(error: unknown): number | undefined {
  let value = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    const response = record.response && typeof record.response === 'object'
      ? record.response as Record<string, unknown>
      : undefined;
    const status = record.statusCode ?? record.status ?? response?.status;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) {
      return status;
    }
    value = record.cause;
  }
  return undefined;
}

/** Normalize only stable provider error fields. */
export function parseProviderError(error: unknown, providerId: string): Error {
  if (isProviderConfigError(error)) return error;
  const status = getProviderHttpStatus(error);
  if (status === 401 || status === 403) {
    return new AuthenticationError(providerId);
  }
  if (status === 404) {
    return new ProviderConfigError('Chat.ConfigError.ModelNotFound', 'MODEL_NOT_FOUND', providerId);
  }
  if (status === 429) {
    return new ProviderConfigError('Chat.ConfigError.RateLimitExceeded', 'RATE_LIMIT_EXCEEDED', providerId);
  }
  return error instanceof Error ? error : new Error('AI provider request failed');
}
