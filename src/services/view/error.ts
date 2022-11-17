import { i18n } from '@services/libs/i18n';

export class ViewLoadUrlError extends Error {
  constructor(initialUrl: string, additionalMessage = '') {
    super();
    this.name = i18n.t('Error.ViewLoadUrlError');
    this.message = `${i18n.t('Error.ViewLoadUrlErrorDescription')} initialUrl: ${initialUrl} ${additionalMessage}`;
  }
}
