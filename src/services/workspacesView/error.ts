import { i18n } from '@services/libs/i18n';

export class WorkspaceFailedToLoadError extends Error {
  constructor(extraMessage?: string, url?: string) {
    super(extraMessage);
    this.name = i18n.t('Error.WorkspaceFailedToLoadError');
    this.message = `${i18n.t('Error.WorkspaceFailedToLoadErrorDescription')} ${extraMessage ?? ''} ${url ?? ''}`;
  }
}
