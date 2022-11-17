import { IGitUserInfos } from '@services/git/interface';
import { i18n } from '@services/libs/i18n';

export class InitWikiGitError extends Error {
  constructor(extraMessage?: string) {
    super(extraMessage);
    this.name = i18n.t('Error.InitWikiGitError');
    this.message = `${i18n.t('Error.InitWikiGitErrorDescription')} ${extraMessage ?? ''}`;
  }
}

export class InitWikiGitRevertError extends Error {
  constructor(extraMessage?: string) {
    super(extraMessage);
    this.name = i18n.t('Error.InitWikiGitRevertError');
    this.message = `${i18n.t('Error.InitWikiGitRevertErrorDescription')} ${extraMessage ?? ''}`;
  }
}

export class InitWikiGitSyncedWikiNoGitUserInfoError extends Error {
  constructor(gitUrl?: string | null, userInfo?: IGitUserInfos | null) {
    super();
    this.name = i18n.t('Error.InitWikiGitSyncedWikiNoGitUserInfoError');
    this.message = `${i18n.t('Error.InitWikiGitSyncedWikiNoGitUserInfoErrorDescription')} gitUrl: ${gitUrl ?? 'undefined'} , userInfo: ${
      userInfo === undefined ? JSON.stringify(userInfo) : 'undefined'
    }`;
  }
}
