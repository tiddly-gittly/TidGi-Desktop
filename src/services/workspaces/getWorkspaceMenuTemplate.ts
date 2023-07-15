import { WikiChannel } from '@/constants/channels';
import { getDefaultHTTPServerIP } from '@/constants/urls';
import type { IAuthenticationService } from '@services/auth/interface';
import { IContextService } from '@services/context/interface';
import { IGitService } from '@services/git/interface';
import type { INativeService } from '@services/native/interface';
import { IPagesService, PageType } from '@services/pages/interface';
import { SupportedStorageServices } from '@services/types';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWikiGitWorkspaceService } from '@services/wikiGitWorkspace/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { MenuItemConstructorOptions } from 'electron';
import type { FlatNamespace, TFunction } from 'i18next';
import type { _DefaultNamespace } from 'react-i18next/TransWithoutContext';
import type { IWorkspace, IWorkspaceService } from './interface';

interface IWorkspaceMenuRequiredServices {
  auth: Pick<IAuthenticationService, 'getStorageServiceUserInfo'>;
  context: Pick<IContextService, 'isOnline'>;
  git: Pick<IGitService, 'commitAndSync'>;
  native: Pick<INativeService, 'open' | 'openInEditor' | 'openInGitGuiApp' | 'getLocalHostUrlWithActualInfo'>;
  pages: Pick<IPagesService, 'setActivePage' | 'getActivePage'>;
  view: Pick<IViewService, 'reloadViewsWebContents' | 'getViewCurrentUrl'>;
  wiki: Pick<IWikiService, 'wikiOperation' | 'requestWikiSendActionMessage'>;
  wikiGitWorkspace: Pick<IWikiGitWorkspaceService, 'removeWorkspace'>;
  window: Pick<IWindowService, 'open'>;
  workspace: Pick<IWorkspaceService, 'getActiveWorkspace' | 'getSubWorkspacesAsList'>;
  workspaceView: Pick<
    IWorkspaceViewService,
    | 'wakeUpWorkspaceView'
    | 'hibernateWorkspaceView'
    | 'setActiveWorkspaceView'
    | 'restartWorkspaceViewService'
    | 'realignActiveWorkspace'
    | 'openUrlInWorkspace'
  >;
}

export async function openWorkspaceTagTiddler(workspace: IWorkspace, service: IWorkspaceMenuRequiredServices): Promise<void> {
  const { id: idToActive, isSubWiki, tagName, mainWikiID } = workspace;
  // switch to workspace page
  const oldActivePage = await service.pages.getActivePage();
  await service.pages.setActivePage(PageType.wiki, oldActivePage?.id);
  const oldActiveWorkspace = await service.workspace.getActiveWorkspace();
  // if is a new main workspace, active its browser view first
  if (!isSubWiki && idToActive !== null && idToActive !== undefined && oldActiveWorkspace?.id !== idToActive) {
    await service.workspaceView.setActiveWorkspaceView(idToActive);
    return;
  }
  // is not a new main workspace
  // open tiddler in the active view
  if (isSubWiki) {
    if (mainWikiID === null || idToActive === undefined || tagName === null) {
      return;
    }
    service.wiki.wikiOperation(WikiChannel.openTiddler, mainWikiID, tagName);
  } else {
    await service.wiki.requestWikiSendActionMessage('tm-home');
  }
}

export async function getWorkspaceMenuTemplate(
  workspace: IWorkspace,
  t: TFunction<[_DefaultNamespace, ...Array<Exclude<FlatNamespace, _DefaultNamespace>>]>,
  service: IWorkspaceMenuRequiredServices,
): Promise<MenuItemConstructorOptions[]> {
  const { active, id, mainWikiID, hibernated, tagName, isSubWiki, wikiFolderLocation, gitUrl, storageService, port, name, enableHTTPAPI } = workspace;
  /* eslint-disable @typescript-eslint/no-misused-promises */
  const template: MenuItemConstructorOptions[] = [
    {
      label: t('WorkspaceSelector.OpenWorkspaceTagTiddler', {
        tagName: tagName ?? (isSubWiki ? name : `${name} ${t('WorkspaceSelector.DefaultTiddlers')}`),
      }),
      click: async () => {
        await openWorkspaceTagTiddler(workspace, service);
      },
    },
    {
      label: t('WorkspaceSelector.EditWorkspace'),
      click: async () => {
        await service.window.open(WindowNames.editWorkspace, { workspaceID: id });
      },
    },
    {
      label: t('WorkspaceSelector.RemoveWorkspace'),
      click: async () => {
        await service.wikiGitWorkspace.removeWorkspace(id);
      },
    },
    {
      label: t('WorkspaceSelector.OpenWorkspaceFolder'),
      click: async () => {
        await service.native.open(wikiFolderLocation, true);
      },
    },
    {
      label: t('WorkspaceSelector.OpenWorkspaceFolderInEditor'),
      click: async () => await service.native.openInEditor(wikiFolderLocation),
    },
    {
      label: t('WorkspaceSelector.OpenWorkspaceFolderInGitGUI'),
      click: async () => await service.native.openInGitGuiApp(wikiFolderLocation),
    },
    {
      label: `${t('WorkspaceSelector.OpenInBrowser')}${enableHTTPAPI ? '' : t('WorkspaceSelector.OpenInBrowserDisabledHint')}`,
      enabled: enableHTTPAPI,
      click: async () => {
        const actualIP = await service.native.getLocalHostUrlWithActualInfo(getDefaultHTTPServerIP(port), id);
        await service.native.open(actualIP);
      },
    },
  ];

  if (gitUrl !== null && gitUrl.length > 0 && storageService !== SupportedStorageServices.local) {
    const userInfo = await service.auth.getStorageServiceUserInfo(storageService);
    if (userInfo !== undefined) {
      const isOnline = await service.context.isOnline();
      template.push({
        label: t('ContextMenu.SyncNow') + (isOnline ? '' : `(${t('ContextMenu.NoNetworkConnection')})`),
        enabled: isOnline,
        click: async () => {
          if (isSubWiki) {
            const hasChanges = await service.git.commitAndSync(workspace, { remoteUrl: gitUrl, userInfo });
            if (hasChanges) {
              if (mainWikiID === null) {
                await service.workspaceView.restartWorkspaceViewService(id);
                await service.view.reloadViewsWebContents(id);
              } else {
                // reload main workspace to reflect change (do this before watch-fs stable)
                await service.workspaceView.restartWorkspaceViewService(mainWikiID);
                await service.view.reloadViewsWebContents(mainWikiID);
              }
            }
          } else {
            // sync all sub workspace
            const mainHasChanges = await service.git.commitAndSync(workspace, { remoteUrl: gitUrl, userInfo });
            const subWorkspaces = await service.workspace.getSubWorkspacesAsList(id);
            const subHasChangesPromise = subWorkspaces.map(async (subWorkspace) => {
              const { gitUrl: subGitUrl } = subWorkspace;
              // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
              if (!subGitUrl) return false;
              const hasChanges = await service.git.commitAndSync(subWorkspace, { remoteUrl: subGitUrl, userInfo });
              return hasChanges;
            });
            const subHasChange = (await Promise.all(subHasChangesPromise)).some(Boolean);
            const hasChange = mainHasChanges || subHasChange;
            if (hasChange) {
              await service.workspaceView.restartWorkspaceViewService(id);
              await service.view.reloadViewsWebContents(id);
            }
          }
        },
      });
    }
  }
  if (storageService === SupportedStorageServices.local) {
    template.push({
      label: t('ContextMenu.BackupNow'),
      click: async () => {
        await service.git.commitAndSync(workspace, { commitOnly: true });
      },
    });
  }

  if (!isSubWiki) {
    template.push(
      {
        label: t('ContextMenu.RestartService'),
        click: async () => {
          await service.workspaceView.restartWorkspaceViewService(id);
          await service.workspaceView.realignActiveWorkspace(id);
        },
      },
      {
        label: t('ContextMenu.Reload'),
        click: async () => {
          await service.view.reloadViewsWebContents(id);
        },
      },
    );
  }

  if (!active && !isSubWiki) {
    template.splice(1, 0, {
      label: hibernated ? t('WorkspaceSelector.WakeUpWorkspace') : t('WorkspaceSelector.HibernateWorkspace'),
      click: async () => {
        if (hibernated) {
          await service.workspaceView.wakeUpWorkspaceView(id);
          return;
        }
        await service.workspaceView.hibernateWorkspaceView(id);
      },
    });
  }
  /* eslint-enable @typescript-eslint/no-misused-promises */

  return template;
}
