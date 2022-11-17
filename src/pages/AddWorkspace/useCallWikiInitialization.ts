import { IGitUserInfos } from '@services/git/interface';
import { INewWorkspaceConfig } from '@services/workspaces/interface';
import type { TFunction } from 'i18next';

export async function callWikiInitialization(
  newWorkspaceConfig: INewWorkspaceConfig,
  wikiCreationMessageSetter: (m: string) => void,
  t: TFunction<'translation'>,
  gitUserInfo: IGitUserInfos | undefined,
): Promise<void> {
  wikiCreationMessageSetter(t('Log.InitializeWikiGit'));
  const newWorkspace = await window.service.wikiGitWorkspace.initWikiGitTransaction(newWorkspaceConfig, gitUserInfo);
  if (newWorkspace === undefined) {
    throw new Error('newWorkspace is undefined');
  }
  // start wiki on startup, or on sub-wiki creation
  wikiCreationMessageSetter(t('Log.InitializeWorkspaceView'));
  /** create workspace from workspaceService to store workspace configs, and create a BrowserView to actually display wiki web content from viewService */
  await window.service.workspaceView.initializeWorkspaceView(newWorkspace, { isNew: true });
  await window.service.workspaceView.setActiveWorkspaceView(newWorkspace.id);
  // wait for wiki to start and close the window now.
  await window.remote.closeCurrentWindow();
}
