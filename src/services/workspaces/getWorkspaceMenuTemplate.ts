import { getDefaultHTTPServerIP } from '@/constants/urls';
import type { IAuthenticationService } from '@services/auth/interface';
import type { IContextService } from '@services/context/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import type { IGitService } from '@services/git/interface';
import type { INativeService } from '@services/native/interface';
import type { IPreferenceService } from '@services/preferences/interface';
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
  externalAPI: Pick<IExternalAPIService, 'getAIConfig'>;
  git: Pick<IGitService, 'commitAndSync' | 'isAIGenerateBackupTitleEnabled'>;
  native: Pick<INativeService, 'log' | 'openURI' | 'openPath' | 'openInEditor' | 'openInGitGuiApp' | 'getLocalHostUrlWithActualInfo'>;
  preference: Pick<IPreferenceService, 'getPreferences'>;
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
    { type: 'separator' },
    {
      label: t('WorkspaceSelector.EditWorkspace'),
      click: async () => {
        await service.window.open(WindowNames.editWorkspace, { workspaceID: id });
      },
    },
    { type: 'separator' },
    {
      label: t('WorkspaceSelector.ViewGitHistory'),
      click: async () => {
        await service.window.open(WindowNames.gitHistory, { workspaceID: id });
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
    { type: 'separator' },
    {
      label: t('WorkspaceSelector.RemoveWorkspace'),
      click: async () => {
        await service.wikiGitWorkspace.removeWorkspace(id);
      },
    },
    { type: 'separator' },
  ];

  // Check if AI-generated backup title is enabled
  const aiGenerateBackupTitleEnabled = await service.git.isAIGenerateBackupTitleEnabled();

  if (gitUrl !== null && gitUrl.length > 0 && storageService !== SupportedStorageServices.local) {
    const userInfo = await service.auth.getStorageServiceUserInfo(storageService);
    if (userInfo !== undefined) {
      const isOnline = await service.context.isOnline();

      if (aiGenerateBackupTitleEnabled) {
        // Show submenu with AI and quick sync options
        template.push({
          label: t('ContextMenu.SyncNow') + (isOnline ? '' : `(${t('ContextMenu.NoNetworkConnection')})`),
          enabled: isOnline,
          submenu: [
            {
              label: t('WorkspaceSelector.SyncNowQuick'),
              click: async () => {
                await service.git.commitAndSync(workspace, {
                  dir: wikiFolderLocation,
                  commitOnly: false,
                  commitMessage: t('LOG.CommitBackupMessage'),
                });
              },
            },
            {
              label: t('WorkspaceSelector.SyncNowWithAI'),
              click: async () => {
                await service.git.commitAndSync(workspace, {
                  dir: wikiFolderLocation,
                  commitOnly: false,
                  // Don't provide commitMessage to trigger AI generation
                });
              },
            },
          ],
        });
      } else {
        // Show single sync option
        template.push({
          label: t('ContextMenu.SyncNow') + (isOnline ? '' : `(${t('ContextMenu.NoNetworkConnection')})`),
          enabled: isOnline,
          click: async () => {
            await service.git.commitAndSync(workspace, {
              dir: wikiFolderLocation,
              commitOnly: false,
            });
          },
        });
      }
    }
  }

  if (storageService === SupportedStorageServices.local) {
    if (aiGenerateBackupTitleEnabled) {
      // Show submenu with AI and quick backup options
      template.push({
        label: t('ContextMenu.BackupNow'),
        submenu: [
          {
            label: t('WorkspaceSelector.CommitNowQuick'),
            click: async () => {
              await service.git.commitAndSync(workspace, {
                dir: wikiFolderLocation,
                commitOnly: true,
                commitMessage: t('LOG.CommitBackupMessage'),
              });
            },
          },
          {
            label: t('WorkspaceSelector.CommitNowWithAI'),
            click: async () => {
              await service.git.commitAndSync(workspace, {
                dir: wikiFolderLocation,
                commitOnly: true,
                // Don't provide commitMessage to trigger AI generation
              });
            },
          },
        ],
      });
    } else {
      // Show single backup option
      template.push({
        label: t('ContextMenu.BackupNow'),
        click: async () => {
          await service.git.commitAndSync(workspace, {
            dir: wikiFolderLocation,
            commitOnly: true,
          });
        },
      });
    }
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
