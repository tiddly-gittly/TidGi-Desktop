import type { TFunction } from 'i18next';
import type { MenuItemConstructorOptions } from 'electron';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWindowService } from '@services/windows/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { IWorkspace, IWorkspaceService } from './interface';
import type { INativeService } from '@services/native/interface';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWikiGitWorkspaceService } from '@services/wikiGitWorkspace/interface';

interface IWorkspaceMenuRequiredServices {
  native: Pick<INativeService, 'open'>;
  view: Pick<IViewService, 'reloadViewsWebContents'>;
  wiki: Pick<IWikiService, 'requestOpenTiddlerInWiki' | 'requestWikiSendActionMessage'>;
  wikiGitWorkspace: Pick<IWikiGitWorkspaceService, 'removeWorkspace'>;
  window: Pick<IWindowService, 'open'>;
  workspace: Pick<IWorkspaceService, 'getActiveWorkspace'>;
  workspaceView: Pick<IWorkspaceViewService, 'wakeUpWorkspaceView' | 'hibernateWorkspaceView' | 'setActiveWorkspaceView' | 'restartWorkspaceViewService'>;
}

export async function openWorkspaceTagTiddler(workspace: IWorkspace, service: IWorkspaceMenuRequiredServices): Promise<void> {
  const { id, isSubWiki, tagName, mainWikiID } = workspace;
  let idToActive = id;
  const activeWorkspace = await service.workspace.getActiveWorkspace();
  if (isSubWiki) {
    if (typeof tagName === 'string') {
      await service.wiki.requestOpenTiddlerInWiki(tagName);
    }
    if (mainWikiID === null) {
      return;
    }
    idToActive = mainWikiID;
  } else {
    await service.wiki.requestWikiSendActionMessage('tm-home');
  }
  if (idToActive !== null && activeWorkspace?.id !== idToActive) {
    await service.workspaceView.setActiveWorkspaceView(idToActive);
  }
}

export function getWorkspaceMenuTemplate(workspace: IWorkspace, t: TFunction, service: IWorkspaceMenuRequiredServices): MenuItemConstructorOptions[] {
  const { active, id, hibernated, tagName, isSubWiki, wikiFolderLocation } = workspace;

  const template = [
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
      label: t('ContextMenu.Reload'),
      click: async () => await service.view.reloadViewsWebContents(id),
    },
    {
      label: t('ContextMenu.RestartService'),
      click: async () => await service.workspaceView.restartWorkspaceViewService(id),
    },
  ];

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
