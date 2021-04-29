import i18n from '@services/libs/i18n';

export class InitWikiGitError extends Error {
  constructor(extraMessage?: string) {
    super(extraMessage);
    this.name = i18n.t('Error.InitWikiGitError');
    this.message = `${i18n.t('Error.InitWikiGitErrorDescription')} ${extraMessage ?? ''}`;
  }
}
