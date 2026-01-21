import { t } from '@services/libs/i18n/placeholder';

/**
 * Placeholders for error message translations used in ErrorMessageRenderer
 * These are registered here to prevent i18n-ally tools from removing them as unused keys.
 * The actual translation happens dynamically in the component using provider names.
 */
export const errorMessageI18nKeys = {
  title: t('Chat.ConfigError.Title'),
  goToSettings: t('Chat.ConfigError.GoToSettings'),

  // Error type translations - these use interpolation with {{provider}}
  missingConfigError: t('Chat.ConfigError.MissingConfigError'),
  missingProviderError: t('Chat.ConfigError.MissingProviderError'),
  authenticationError: t('Chat.ConfigError.AuthenticationError'),
  missingAPIKeyError: t('Chat.ConfigError.MissingAPIKeyError'),
  missingBaseURLError: t('Chat.ConfigError.MissingBaseURLError'),

  // Legacy keys that may still exist in i18n files
  authenticationFailed: t('Chat.ConfigError.AuthenticationFailed'),
  providerNotFound: t('Chat.ConfigError.ProviderNotFound'),
} as const;
