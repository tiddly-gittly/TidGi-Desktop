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
  provider: string;

  constructor(message: string, code: string, provider: string) {
    super(message);
    this.name = 'ProviderConfigError';
    this.code = code;
    this.provider = provider;

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
      provider: this.provider,
    };
  }
}

/**
 * Error for missing API key
 */
export class MissingAPIKeyError extends ProviderConfigError {
  constructor(provider: string) {
    super(
      `API key for ${provider} not found`,
      'MISSING_API_KEY',
      provider,
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
  constructor(provider: string) {
    super(
      `${provider} provider requires baseURL`,
      'MISSING_BASE_URL',
      provider,
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
  constructor(provider: string) {
    super(
      `${provider} authentication failed: Invalid API key`,
      'AUTHENTICATION_FAILED',
      provider,
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
 * Try to parse a generic error into a ProviderConfigError if possible
 */
export function parseProviderError(error: Error, provider: string): Error {
  const message = error.message.toLowerCase();

  if (message.includes('api key') && message.includes('not found')) {
    return new MissingAPIKeyError(provider);
  }

  if (message.includes('requires baseurl')) {
    return new MissingBaseURLError(provider);
  }

  if (message.includes('authentication failed') || message.includes('401')) {
    return new AuthenticationError(provider);
  }

  return error;
}
