import { i18n } from '@services/libs/i18n';

export class ZxInitializationError extends Error {
  constructor(extraMessage?: string) {
    super(extraMessage);
    this.name = i18n.t('Error.ZxInitializationError');
    this.message = `${i18n.t('Error.ZxInitializationErrorDescription')} ${extraMessage ?? ''}`;
  }
}

export class ZxNotInitializedError extends Error {
  constructor(extraMessage?: string) {
    super(extraMessage);
    this.name = i18n.t('Error.ZxNotInitializedError');
    this.message = `${i18n.t('Error.ZxNotInitializedErrorDescription')} ${extraMessage ?? ''}`;
  }
}

export class ZxInitializationRetryFailedError extends Error {
  constructor(wikiHomePath?: string) {
    super(wikiHomePath);
    this.name = i18n.t('Error.ZxInitializationRetryFailedError');
    this.message = `${i18n.t('Error.ZxInitializationRetryFailedErrorDescription')} ${wikiHomePath ?? ''}`;
  }
}
