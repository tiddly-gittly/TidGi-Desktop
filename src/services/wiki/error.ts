import i18n from '@services/libs/i18n';

export class CopyWikiTemplateError extends Error {
  constructor(extraMessage?: string) {
    super(extraMessage);
    this.name = i18n.t('Error.CopyWikiTemplateError');
    this.message = `${i18n.t('Error.CopyWikiTemplateErrorDescription')} ${extraMessage ?? ''}`;
  }
}
