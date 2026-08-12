import type { AIErrorDetail } from './interface';

export interface ConfigErrorPresentation {
  fallbackMessage: string;
  key: string;
  params: Record<string, string>;
}

export type PersistedAIErrorDetail = Partial<AIErrorDetail> & {
  message: string;
  name: string;
};

const CONFIG_ERROR_KEY_BY_CODE: Record<string, string> = {
  AUTHENTICATION_FAILED: 'AuthenticationError',
  MISSING_API_KEY: 'MissingAPIKeyError',
  MISSING_BASE_URL: 'MissingBaseURLError',
  MODEL_NO_VISION_SUPPORT: 'ModelNoVisionSupport',
  NO_DEFAULT_MODEL: 'NoDefaultModel',
  PROVIDER_NOT_FOUND: 'ProviderNotFound',
};

const CONFIG_ERROR_KEYS = new Set([
  'AuthenticationError',
  'AuthenticationFailed',
  'MissingAPIKeyError',
  'MissingBaseURLError',
  'MissingConfigError',
  'MissingProviderError',
  'ModelNoVisionSupport',
  'NoDefaultModel',
  'ProviderNotFound',
]);

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string | number | boolean] => ['string', 'number', 'boolean'].includes(typeof entry[1]))
      .map(([key, item]) => [key, String(item)]),
  );
}

function inferRawConfigurationError(message: string): { key: string; params: Record<string, string> } | undefined {
  const apiKeyMatch = /API key for (.+?) not found/i.exec(message);
  if (apiKeyMatch?.[1]) {
    return { key: 'MissingAPIKeyError', params: { provider: apiKeyMatch[1] } };
  }
  const baseURLMatch = /^(.+?) provider requires baseURL/i.exec(message);
  if (baseURLMatch?.[1]) {
    return { key: 'MissingBaseURLError', params: { provider: baseURLMatch[1] } };
  }
  const authenticationMatch = /^(.+?) authentication failed/i.exec(message);
  if (authenticationMatch?.[1]) {
    return { key: 'AuthenticationError', params: { provider: authenticationMatch[1] } };
  }
  return undefined;
}

/** Convert all provider-error paths into one renderer presentation contract. */
export function getConfigErrorPresentation(
  message: string,
  detail?: Partial<AIErrorDetail> | Record<string, unknown>,
): ConfigErrorPresentation | undefined {
  const parameters = {
    ...asStringRecord(detail?.params),
    ...(typeof detail?.provider === 'string' && detail.provider !== 'unknown' ? { provider: detail.provider } : {}),
  };
  if (message.startsWith('Chat.ConfigError.')) {
    return {
      fallbackMessage: typeof detail?.message === 'string' ? detail.message : message,
      key: message.slice('Chat.ConfigError.'.length),
      params: parameters,
    };
  }

  const codeKey = typeof detail?.code === 'string' ? CONFIG_ERROR_KEY_BY_CODE[detail.code] : undefined;
  if (codeKey) {
    return { fallbackMessage: message, key: codeKey, params: parameters };
  }

  if (typeof detail?.name === 'string' && CONFIG_ERROR_KEYS.has(detail.name)) {
    return { fallbackMessage: message, key: detail.name, params: parameters };
  }

  const inferred = inferRawConfigurationError(message);
  return inferred
    ? {
      fallbackMessage: message,
      key: inferred.key,
      params: { ...inferred.params, ...parameters },
    }
    : undefined;
}

/** Preserve structured fields carried by an Error across persistence/IPC. */
export function serializeAIError(error: unknown): {
  content: string;
  detail: PersistedAIErrorDetail;
} {
  const message = error instanceof Error ? error.message : String(error);
  const structured = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const detail: PersistedAIErrorDetail = {
    message,
    name: error instanceof Error ? error.name : 'Error',
    ...(typeof structured.code === 'string' ? { code: structured.code } : {}),
    ...(typeof structured.provider === 'string' ? { provider: structured.provider } : {}),
    ...(Object.keys(asStringRecord(structured.params)).length > 0 ? { params: asStringRecord(structured.params) } : {}),
  };
  const presentation = getConfigErrorPresentation(message, detail);
  return {
    content: presentation ? `Chat.ConfigError.${presentation.key}` : message,
    detail: presentation
      ? { ...detail, params: presentation.params }
      : detail,
  };
}
