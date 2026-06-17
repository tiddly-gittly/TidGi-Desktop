import { IAskAIWithSelectionData } from '@/constants/channels';
import { getDefaultHTTPServerIP } from '@/constants/urls';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAuthenticationService } from '@services/auth/interface';
import type { IContextService } from '@services/context/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import type { IGitService } from '@services/git/interface';
import { createBackupMenuItems, createSyncMenuItems } from '@services/git/menuItems';
import { createTalkWithAIMenuItems } from '@services/menu/createTalkWithAIMenuItems';
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
import { nanoid } from 'nanoid';
import type { _DefaultNamespace } from 'react-i18next/TransWithoutContext';
import type { IWorkspace, IWorkspaceService } from './interface';
import { isWikiWorkspace } from './interface';
import { getWorkspaceStrategy } from './strategies';
import { isHtmlWikiWorkspace } from './workspacePaths';

interface IWorkspaceMenuRequiredServices {
  agentDefinition: Pick<IAgentDefinitionService, 'getAgentDef' | 'getAgentDefs'>;
  auth: Pick<IAuthenticationService, 'getStorageServiceUserInfo'>;
  context: Pick<IContextService, 'isOnline'>;
  externalAPI: Pick<IExternalAPIService, 'getAIConfig'>;
  git: Pick<IGitService, 'commitAndSync' | 'isAIGenerateBackupTitleEnabled'>;
  native: Pick<INativeService, 'log' | 'openURI' | 'openPath' | 'openInEditor' | 'openInGitGuiApp' | 'getLocalHostUrlWithActualInfo'>;
  preference: Pick<IPreferenceService, 'getPreferences'>;
  sync: Pick<ISyncService, 'syncWikiIfNeeded'>;
  view: Pick<IViewService, 'reloadViewsWebContents' | 'getViewCurrentUrl' | 'canGoBackInView' | 'canGoForwardInView' | 'goBackInView' | 'goForwardInView'>;
  wiki: Pick<IWikiService, 'wikiOperationInBrowser' | 'wikiOperationInServer'>;
  wikiGitWorkspace: Pick<IWikiGitWorkspaceService, 'removeWorkspace'>;
  window: Pick<IWindowService, 'open' | 'get'>;
  workspace: Pick<
    IWorkspaceService,
    'getActiveWorkspace' | 'getSubWorkspacesAsList' | 'getWorkspacesAsList' | 'openWorkspaceTiddler' | 'getGroupsAsList' | 'setGroup' | 'moveWorkspaceToGroup' | 'removeGroup'
  >;
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

/**
 * Get simplified workspace menu template (for top-level context menu)
 * Includes frequently used items, command palette, and "Current Workspace" submenu
 */
export async function getSimplifiedWorkspaceMenuTemplate(
  workspace: IWorkspace,
  t: TFunction<[_DefaultNamespace, ...Array<Exclude<FlatNamespace, _DefaultNamespace>>]>,
  service: IWorkspaceMenuRequiredServices,
  options?: {
    /** Selected text from the context menu event (empty if none). Passed as initial message to AI. */
    selectionText?: string;
    /**
     * When called from the renderer process, provide this callback to trigger the AI action locally
     * instead of going through a main-process BrowserWindow reference (which is not IPC-serialisable).
     */
    onTriggerTalkWithAI?: (data: IAskAIWithSelectionData) => void;
  },
): Promise<MenuItemConstructorOptions[]> {
  if (!isWikiWorkspace(workspace)) {
    return [];
  }

  const { id, storageService, gitUrl } = workspace;
  const template: MenuItemConstructorOptions[] = [];

  const lastUrl = await service.view.getViewCurrentUrl(id, WindowNames.main);
  const talkWithAIMenuItems = await createTalkWithAIMenuItems({
    agentDefinitionService: service.agentDefinition,
    selectionText: options?.selectionText ?? '',
    t,
    wikiUrl: lastUrl,
    windowService: service.window,
    workspaceId: id,
    onTrigger: options?.onTriggerTalkWithAI,
  });

  template.push(...talkWithAIMenuItems);
  template.push({ type: 'separator' });

  // Add "Current Workspace" submenu with full menu
  const fullMenuTemplate = await getWorkspaceMenuTemplate(workspace, t, service);
  if (fullMenuTemplate.length > 0) {
    template.push({
      label: t('Menu.CurrentWorkspace'),
      submenu: fullMenuTemplate,
    });
  }
  // Edit workspace
  template.push({
    label: t('WorkspaceSelector.EditWorkspace'),
    click: async () => {
      await service.window.open(WindowNames.editWorkspace, { workspaceID: id });
    },
  });

  // Workspace group management
  const groups = await service.workspace.getGroupsAsList();
  if (workspace.groupId) {
    // Workspace is in a group - show "Remove from Group"
    template.push({
      label: t('WorkspaceGroup.RemoveFromGroup'),
      click: async () => {
        // Pass autoDisband=false so right-click removal never auto-deletes the group.
        // Only dragging out the last workspace should truly cancel a group.
        await service.workspace.moveWorkspaceToGroup(id, null, false);
      },
    });
  } else {
    // Workspace is not in a group - show "Create Group" and "Move to Group" (if groups exist)
    template.push({
      label: t('WorkspaceGroup.CreateGroup'),
      click: async () => {
        const newGroupId = nanoid();
        const ungroupedWorkspaces = (await service.workspace.getWorkspacesAsList()).filter(workspaceToCheck => !workspaceToCheck.pageType && !workspaceToCheck.groupId);
        const maxUngroupedOrder = ungroupedWorkspaces.reduce((maxOrder, workspaceToCheck) => Math.max(maxOrder, workspaceToCheck.order ?? 0), -1);
        await service.workspace.setGroup(newGroupId, {
          id: newGroupId,
          name: t('WorkspaceGroup.DefaultGroupName', { number: groups.length + 1 }),
          collapsed: false,
          order: Math.max(maxUngroupedOrder + groups.length + 1, groups.length),
        });
        await service.workspace.moveWorkspaceToGroup(id, newGroupId);
      },
    });

    if (groups.length > 0) {
      template.push({
        label: t('WorkspaceGroup.MoveToGroup'),
        submenu: groups.map((group) => ({
          label: group.name,
          click: async () => {
            await service.workspace.moveWorkspaceToGroup(id, group.id);
          },
        })),
      });
    }
  }

  // View git history (always visible for wiki workspaces)
  template.push({
    label: t('WorkspaceSelector.ViewGitHistory'),
    click: async () => {
      await service.window.open(WindowNames.gitHistory, { workspaceID: id }, { recreate: true });
    },
  });

  const aiGenerateBackupTitleEnabled = await service.git.isAIGenerateBackupTitleEnabled();

  // Sync items for cloud workspaces
  if (storageService !== SupportedStorageServices.local && gitUrl) {
    const userInfo = await service.auth.getStorageServiceUserInfo(storageService);
    if (userInfo !== undefined) {
      const isOnline = await service.context.isOnline();
      const syncItems = createSyncMenuItems(workspace, t, service.sync, aiGenerateBackupTitleEnabled, isOnline, false);
      template.push(...syncItems);
    }
  }

  // Local backup option (always shown for all wiki workspaces)
  const backupItems = createBackupMenuItems(workspace, t, service.git, aiGenerateBackupTitleEnabled, false);
  template.push(...backupItems);

  return template;
}

/**
 * Get full workspace menu template (for "Current Workspace" submenu)
 */
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

  const { hibernated, tagNames, isSubWiki, wikiFolderLocation, gitUrl, storageService, port, enableHTTPAPI, lastUrl, homeUrl } = workspace;
  const menuStrategy = getWorkspaceStrategy(workspace).menu;
  const openPath = menuStrategy.getManagedPathForOpen(workspace) ?? wikiFolderLocation;
  const containerPath = isHtmlWikiWorkspace(workspace) ? wikiFolderLocation : wikiFolderLocation;

  const template: MenuItemConstructorOptions[] = [
    ...(!isHtmlWikiWorkspace(workspace)
      ? [{
        label: t('WorkspaceSelector.OpenWorkspaceTagTiddler', {
          tagName: tagNames[0] ?? (isSubWiki ? name : `${name} ${t('WorkspaceSelector.DefaultTiddlers')}`),
        }),
        click: async () => {
          await service.workspace.openWorkspaceTiddler(workspace);
        },
      }]
      : []),
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
        await service.window.open(WindowNames.gitHistory, { workspaceID: id }, { recreate: true });
      },
    },
    {
      label: isHtmlWikiWorkspace(workspace) ? t('WorkspaceSelector.OpenHtmlWikiFile') : t('WorkspaceSelector.OpenWorkspaceFolder'),
      click: async () => {
        await service.native.openPath(openPath);
      },
    },
    {
      label: isHtmlWikiWorkspace(workspace) ? t('WorkspaceSelector.OpenHtmlWikiFolder') : t('WorkspaceSelector.OpenWorkspaceFolderInEditor'),
      click: async () => await service.native.openInEditor(containerPath),
    },
    {
      label: t('WorkspaceSelector.OpenWorkspaceFolderInGitGUI'),
      click: async () => await service.native.openInGitGuiApp(containerPath),
    },

    {
      label: `${t('WorkspaceSelector.OpenInBrowser')}${enableHTTPAPI && menuStrategy.canOpenInBrowser ? '' : t('WorkspaceSelector.OpenInBrowserDisabledHint')}`,
      enabled: enableHTTPAPI && menuStrategy.canOpenInBrowser,
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

  // For cloud workspaces with a configured git remote: add sync items
  if (gitUrl !== null && gitUrl.length > 0 && storageService !== SupportedStorageServices.local) {
    const userInfo = await service.auth.getStorageServiceUserInfo(storageService);
    if (userInfo !== undefined) {
      const isOnline = await service.context.isOnline();
      const syncItems = createSyncMenuItems(workspace, t, service.sync, aiGenerateBackupTitleEnabled, isOnline, false);
      template.push(...syncItems);
    }
  }

  // Local backup is always shown for all wiki workspaces
  const backupItems = createBackupMenuItems(workspace, t, service.git, aiGenerateBackupTitleEnabled, false);
  template.push(...backupItems);

  if (!isSubWiki && menuStrategy.canRestartService) {
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

  const [canGoBack, canGoForward] = await Promise.all([
    service.view.canGoBackInView(id, WindowNames.main),
    service.view.canGoForwardInView(id, WindowNames.main),
  ]);
  template.push(
    { type: 'separator' },
    {
      label: t('ContextMenu.Back'),
      enabled: canGoBack,
      click: () => {
        void service.view.goBackInView(id, WindowNames.main);
      },
    },
    {
      label: t('ContextMenu.Forward'),
      enabled: canGoForward,
      click: () => {
        void service.view.goForwardInView(id, WindowNames.main);
      },
    },
  );

  return template;
}
