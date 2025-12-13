import { t } from '@services/libs/i18n/placeholder';

export const rootTiddlers = ['$:/core/save/all', '$:/core/save/lazy-images', '$:/core/save/lazy-all'];
// Keep i18n ally think these keys exist, otherwise it will delete them during "check usage"
t('EditWorkspace.WikiRootTiddlerItems.all');
t('EditWorkspace.WikiRootTiddlerItems.lazy-images');
t('EditWorkspace.WikiRootTiddlerItems.lazy-all');
