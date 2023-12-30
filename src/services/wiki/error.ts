import { i18n } from '@services/libs/i18n';
import { IWorkspace } from '@services/workspaces/interface';

export class CopyWikiTemplateError extends Error {
  constructor(extraMessage?: string) {
    super(extraMessage);
    this.name = i18n.t('Error.CopyWikiTemplateError');
    this.message = `${i18n.t('Error.CopyWikiTemplateErrorDescription')} ${extraMessage ?? ''}`;
  }
}

export class DoubleWikiInstanceError extends Error {
  constructor(wikiHomePath?: string) {
    super(wikiHomePath);
    this.name = i18n.t('Error.DoubleWikiInstanceError');
    this.message = `${i18n.t('Error.DoubleWikiInstanceErrorDescription')} ${wikiHomePath ?? ''}`;
  }
}

export class SubWikiSMainWikiNotExistError extends Error {
  constructor(subWiki?: string, mainWiki?: string | null) {
    super(subWiki);
    this.name = i18n.t('Error.SubWikiSMainWikiNotExistError');
    this.message = `${i18n.t('Error.SubWikiSMainWikiNotExistErrorDescription')} Sub: ${mainWiki ?? '-'} Main: ${mainWiki ?? '-'}`;
  }
}

export class WikiRuntimeError extends Error {
  retry = false;
  newWorkspace: IWorkspace | undefined;
  constructor(error: Error, wikiHomePath?: string, retry?: boolean, newWorkspace?: IWorkspace) {
    super(wikiHomePath);
    this.retry = retry ?? false;
    this.newWorkspace = newWorkspace;
    this.name = i18n.t('Error.WikiRuntimeError');
    this.message = `${i18n.t('Error.WikiRuntimeErrorDescription')} ${wikiHomePath ?? ''} ${error.message}`;
    this.stack = error.stack;
  }
}

export class HTMLCanNotLoadError extends Error {
  constructor(htmlWikiPath?: string) {
    super(htmlWikiPath);
    this.name = i18n.t('Error.HTMLCanNotLoadError');
    this.message = `${i18n.t('Error.HTMLCanNotLoadErrorDescription')} ${htmlWikiPath ?? ''}`;
  }
}

export class AlreadyExistError extends Error {
  constructor(wikiFolderPath?: string) {
    super(wikiFolderPath);
    this.name = i18n.t('Error.AlreadyExistError');
    this.message = `${i18n.t('Error.ALreadyExistErrorDescription')} ${wikiFolderPath ?? ''}`;
  }
}
