import { WikiCreationMethod } from '@/constants/wikiCreation';
import { IGitUserInfos } from '@services/git/interface';
import { INewWorkspaceConfig } from '@services/workspaces/interface';
import type { TFunction } from 'i18next';

interface ICallWikiInitConfig {
  from: WikiCreationMethod;
  notClose?: boolean;
}

export async function callWikiInitialization(
  newWorkspaceConfig: INewWorkspaceConfig,
  wikiCreationMessageSetter: (m: string) => void,
  t: TFunction<'translation'>,
  gitUserInfo: IGitUserInfos | undefined,
  configs: ICallWikiInitConfig,
): Promise<void> {
  wikiCreationMessageSetter(t('Log.InitializeWikiGit'));
  const newWorkspace = await window.service.wikiGitWorkspace.initWikiGitTransaction(newWorkspaceConfig, gitUserInfo);
  if (newWorkspace === undefined) {
    throw new Error('newWorkspace is undefined');
  }
  // start wiki on startup, or on sub-wiki creation
  wikiCreationMessageSetter(t('Log.InitializeWorkspaceView'));
  /** create workspace from workspaceService to store workspace configs, and create a BrowserView to actually display wiki web content from viewService */
  await window.service.workspaceView.initializeWorkspaceView(newWorkspace, { isNew: true, from: configs.from });
  wikiCreationMessageSetter(t('Log.InitializeWorkspaceViewDone'));
  await window.service.workspaceView.setActiveWorkspaceView(newWorkspace.id);
  wikiCreationMessageSetter('');
  if (configs?.notClose !== true) {
    // wait for wiki to start and close the window now.
    await window.remote.closeCurrentWindow();
  }
}
