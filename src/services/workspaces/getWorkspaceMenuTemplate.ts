import { getDefaultHTTPServerIP } from '@/constants/urls';
import type { IAuthenticationService } from '@services/auth/interface';
import type { IContextService } from '@services/context/interface';
import type { IGitService } from '@services/git/interface';
import type { INativeService } from '@services/native/interface';
import type { ISyncService } from '@services/sync/interface';
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
import { isWikiWorkspace } from './interface';

interface IWorkspaceMenuRequiredServices {
  auth: Pick<IAuthenticationService, 'getStorageServiceUserInfo'>;
  context: Pick<IContextService, 'isOnline'>;
  git: Pick<IGitService, 'commitAndSync'>;
  native: Pick<INativeService, 'log' | 'openURI' | 'openPath' | 'openInEditor' | 'openInGitGuiApp' | 'getLocalHostUrlWithActualInfo'>;
  sync: Pick<ISyncService, 'syncWikiIfNeeded'>;
  view: Pick<IViewService, 'reloadViewsWebContents' | 'getViewCurrentUrl'>;
  wiki: Pick<IWikiService, 'wikiOperationInBrowser' | 'wikiOperationInServer'>;
  wikiGitWorkspace: Pick<IWikiGitWorkspaceService, 'removeWorkspace'>;
  window: Pick<IWindowService, 'open'>;
  workspace: Pick<IWorkspaceService, 'getActiveWorkspace' | 'getSubWorkspacesAsList' | 'openWorkspaceTiddler'>;
  workspaceView: Pick<
    IWorkspaceViewService,
    | 'wakeUpWorkspaceView'
    | 'hibernateWorkspaceView'
    | 'setActiveWorkspaceView'
    | 'restartWorkspaceViewService'
    | 'realignActiveWorkspace'
    | 'openUrlInWorkspace'
    | 'openWorkspaceWindowWithView'
  >;
}

export async function getWorkspaceMenuTemplate(
  workspace: IWorkspace,
  t: TFunction<[_DefaultNamespace, ...Array<Exclude<FlatNamespace, _DefaultNamespace>>]>,
  service: IWorkspaceMenuRequiredServices,
): Promise<MenuItemConstructorOptions[]> {
  const { active, id, name } = workspace;

  if (!isWikiWorkspace(workspace)) {
    return [{
      label: t('WorkspaceSelector.DedicatedWorkspace'),
      enabled: false,
    }];
  }

  const { hibernated, tagName, isSubWiki, wikiFolderLocation, gitUrl, storageService, port, enableHTTPAPI, lastUrl, homeUrl } = workspace;

  const template: MenuItemConstructorOptions[] = [
    {
      label: t('WorkspaceSelector.OpenWorkspaceTagTiddler', {
        tagName: tagName ?? (isSubWiki ? name : `${name} ${t('WorkspaceSelector.DefaultTiddlers')}`),
      }),
      click: async () => {
        await service.workspace.openWorkspaceTiddler(workspace);
      },
    },
    {
      label: t('ContextMenu.OpenWorkspaceInNewWindow'),
      enabled: !hibernated,
      click: async () => {
        await service.workspaceView.openWorkspaceWindowWithView(workspace, { uri: lastUrl ?? homeUrl });
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
        await service.native.openPath(wikiFolderLocation);
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
        await service.native.openURI(actualIP);
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
          await service.sync.syncWikiIfNeeded(workspace);
        },
      });
    }
  }
  if (storageService === SupportedStorageServices.local) {
    template.push({
      label: t('ContextMenu.BackupNow'),
      click: async () => {
        await service.sync.syncWikiIfNeeded(workspace);
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
    // This is rarely used, put in the middle.
    template.splice(3, 0, {
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

  return template;
}
