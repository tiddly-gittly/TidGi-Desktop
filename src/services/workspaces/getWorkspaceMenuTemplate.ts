import type { TFunction } from 'i18next';
import type { MenuItemConstructorOptions } from 'electron';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWindowService } from '@services/windows/interface';
import type { IAuthenticationService } from '@services/auth/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { IWorkspace, IWorkspaceService } from './interface';
import type { INativeService } from '@services/native/interface';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWikiGitWorkspaceService } from '@services/wikiGitWorkspace/interface';
import { IContextService } from '@services/context/interface';
import { IGitService } from '@services/git/interface';
import { SupportedStorageServices } from '@services/types';

interface IWorkspaceMenuRequiredServices {
  auth: Pick<IAuthenticationService, 'getStorageServiceUserInfo'>;
  context: Pick<IContextService, 'isOnline'>;
  git: Pick<IGitService, 'commitAndSync'>;
  native: Pick<INativeService, 'open' | 'openInEditor' | 'openInGitGuiApp'>;
  view: Pick<IViewService, 'reloadViewsWebContents'>;
  wiki: Pick<IWikiService, 'requestOpenTiddlerInWiki' | 'requestWikiSendActionMessage'>;
  wikiGitWorkspace: Pick<IWikiGitWorkspaceService, 'removeWorkspace'>;
  window: Pick<IWindowService, 'open'>;
  workspace: Pick<IWorkspaceService, 'getActiveWorkspace'>;
  workspaceView: Pick<
    IWorkspaceViewService,
    'wakeUpWorkspaceView' | 'hibernateWorkspaceView' | 'setActiveWorkspaceView' | 'restartWorkspaceViewService' | 'realignActiveWorkspace'
  >;
}

export async function openWorkspaceTagTiddler(workspace: IWorkspace, service: IWorkspaceMenuRequiredServices): Promise<void> {
  const { id, isSubWiki, tagName, mainWikiID } = workspace;
  let idToActive = id;
  const oldActiveWorkspace = await service.workspace.getActiveWorkspace();
  // if is a new main workspace, active its browser view first
  if (!isSubWiki && idToActive !== null && idToActive !== undefined && oldActiveWorkspace?.id !== idToActive) {
    return await service.workspaceView.setActiveWorkspaceView(idToActive);
  }
  // is not a new main workspace
  // open tiddler in the active view
  if (isSubWiki) {
    if (typeof tagName === 'string') {
      await service.wiki.requestOpenTiddlerInWiki(tagName);
    }
    if (mainWikiID === null || idToActive === undefined) {
      return;
    }
    idToActive = mainWikiID;
  } else {
    await service.wiki.requestWikiSendActionMessage('tm-home');
  }
}

export async function getWorkspaceMenuTemplate(
  workspace: IWorkspace,
  t: TFunction,
  service: IWorkspaceMenuRequiredServices,
): Promise<MenuItemConstructorOptions[]> {
  const { active, id, hibernated, tagName, isSubWiki, wikiFolderLocation, gitUrl, storageService } = workspace;
  const template: MenuItemConstructorOptions[] = [
    {
      label: t('WorkspaceSelector.OpenWorkspaceTagTiddler', { tagName }),
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
      click: async () => await service.wikiGitWorkspace.removeWorkspace(id),
    },
    {
      label: t('WorkspaceSelector.OpenWorkspaceFolder'),
      click: async () => await service.native.open(wikiFolderLocation, true),
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
      label: t('ContextMenu.Reload'),
      click: async () => await service.view.reloadViewsWebContents(id),
    },
    {
      label: t('ContextMenu.RestartService'),
      click: async () => {
        await service.workspaceView.restartWorkspaceViewService(id);
        await service.workspaceView.realignActiveWorkspace(id);
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
          await service.git.commitAndSync(workspace, gitUrl, userInfo);
          await service.workspaceView.restartWorkspaceViewService(id);
          await service.view.reloadViewsWebContents(id);
        },
      });
    }
  }

  if (!active && !isSubWiki) {
    template.splice(1, 0, {
      label: hibernated ? t('WorkspaceSelector.WakeUpWorkspace') : t('WorkspaceSelector.HibernateWorkspace'),
      click: async () => {
        if (hibernated) {
          return await service.workspaceView.wakeUpWorkspaceView(id);
        }
        return await service.workspaceView.hibernateWorkspaceView(id);
      },
    });
  }

  return template;
}
