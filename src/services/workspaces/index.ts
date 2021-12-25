/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable unicorn/no-null */
import { injectable } from 'inversify';
import { app } from 'electron';
import settings from 'electron-settings';
import { pickBy, mapValues, debounce } from 'lodash';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fsExtra from 'fs-extra';
import Jimp from 'jimp';
import { Observable, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IViewService } from '@services/view/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { IWindowService } from '@services/windows/interface';
import type { IMenuService } from '@services/menu/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWikiGitWorkspaceService } from '@services/wikiGitWorkspace/interface';
import { SupportedStorageServices } from '@services/types';
import { lazyInject } from '@services/container';
import type { IWorkspaceService, IWorkspace, IWorkspaceMetaData, INewWorkspaceConfig, IWorkspaceWithMetadata } from './interface';
import i18n from '@services/libs/i18n';
import { defaultServerIP } from '@/constants/urls';
import { logger } from '@services/libs/log';
import { workspaceSorter } from './utils';

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
const debouncedSetSettingFile = debounce(async (workspaces: Record<string, IWorkspace>) => await settings.set(`workspaces`, workspaces as any), 500);

@injectable()
export class Workspace implements IWorkspaceService {
  /**
   * Record from workspace id to workspace settings
   */
  private workspaces: Record<string, IWorkspace> = {};
  public workspaces$: BehaviorSubject<Record<string, IWorkspaceWithMetadata>>;

  @lazyInject(serviceIdentifier.Wiki) private readonly wikiService!: IWikiService;
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  @lazyInject(serviceIdentifier.View) private readonly viewService!: IViewService;
  @lazyInject(serviceIdentifier.WorkspaceView) private readonly workspaceViewService!: IWorkspaceViewService;
  @lazyInject(serviceIdentifier.WikiGitWorkspace) private readonly wikiGitWorkspaceService!: IWikiGitWorkspaceService;
  @lazyInject(serviceIdentifier.MenuService) private readonly menuService!: IMenuService;

  constructor() {
    this.workspaces = this.getInitWorkspacesForCache();
    void this.registerMenu();
    this.workspaces$ = new BehaviorSubject<Record<string, IWorkspaceWithMetadata>>(this.getWorkspacesWithMetadata());
  }

  private getWorkspacesWithMetadata(): Record<string, IWorkspaceWithMetadata> {
    return mapValues(this.getWorkspacesSync(), (workspace: IWorkspace, id): IWorkspaceWithMetadata => ({ ...workspace, metadata: this.getMetaDataSync(id) }));
  }

  private async updateWorkspaceSubject(): Promise<void> {
    this.workspaces$.next(this.getWorkspacesWithMetadata());
  }

  private async registerMenu(): Promise<void> {
    await this.menuService.insertMenu('Workspaces', [
      {
        label: () => i18n.t('Menu.SelectNextWorkspace'),
        click: async () => {
          const currentActiveWorkspace = await this.getActiveWorkspace();
          if (currentActiveWorkspace === undefined) return;
          const nextWorkspace = await this.getNextWorkspace(currentActiveWorkspace.id);
          if (nextWorkspace === undefined) return;
          await this.workspaceViewService.setActiveWorkspaceView(nextWorkspace.id);
        },
        accelerator: 'CmdOrCtrl+Shift+]',
        enabled: async () => (await this.countWorkspaces()) > 1,
      },
      {
        label: () => i18n.t('Menu.SelectPreviousWorkspace'),
        click: async () => {
          const currentActiveWorkspace = await this.getActiveWorkspace();
          if (currentActiveWorkspace === undefined) return;
          const previousWorkspace = await this.getPreviousWorkspace(currentActiveWorkspace.id);
          if (previousWorkspace === undefined) return;
          await this.workspaceViewService.setActiveWorkspaceView(previousWorkspace.id);
        },
        accelerator: 'CmdOrCtrl+Shift+[',
        enabled: async () => (await this.countWorkspaces()) > 1,
      },
      { type: 'separator' },
      {
        label: () => i18n.t('WorkspaceSelector.EditCurrentWorkspace'),
        click: async () => {
          const currentActiveWorkspace = await this.getActiveWorkspace();
          if (currentActiveWorkspace === undefined) return;
          await this.windowService.open(WindowNames.editWorkspace, { workspaceID: currentActiveWorkspace.id });
        },
        enabled: async () => (await this.countWorkspaces()) > 0,
      },
      {
        label: () => i18n.t('WorkspaceSelector.ReloadCurrentWorkspace'),
        click: async () => {
          const currentActiveWorkspace = await this.getActiveWorkspace();
          if (currentActiveWorkspace === undefined) return;
          await this.viewService.reloadActiveBrowserView();
        },
        enabled: async () => (await this.countWorkspaces()) > 0,
      },
      {
        label: () => i18n.t('WorkspaceSelector.RemoveCurrentWorkspace'),
        click: async () => {
          const currentActiveWorkspace = await this.getActiveWorkspace();
          if (currentActiveWorkspace === undefined) return;
          await this.wikiGitWorkspaceService.removeWorkspace(currentActiveWorkspace.id);
        },
        enabled: async () => (await this.countWorkspaces()) > 0,
      },
      { type: 'separator' },
      {
        label: () => i18n.t('AddWorkspace.AddWorkspace'),
        click: async () => {
          await this.windowService.open(WindowNames.addWorkspace);
        },
      },
    ]);
  }

  /**
   * Update items like "activate workspace1" or "open devtool in workspace1" in the menu
   */
  private async updateWorkspaceMenuItems(): Promise<void> {
    const newMenuItems = (await this.getWorkspacesAsList()).flatMap((workspace, index) => [
      {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        label: (): string => workspace.name || `Workspace ${index + 1}`,
        id: workspace.id,
        type: 'checkbox' as const,
        checked: () => workspace.active,
        click: async () => {
          await this.workspaceViewService.setActiveWorkspaceView(workspace.id);
          // manually update menu since we have alter the active workspace
          await this.menuService.buildMenu();
        },
        accelerator: `CmdOrCtrl+${index + 1}`,
      },
      {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        label: () => `${workspace.name || `Workspace ${index + 1}`} ${i18n.t('ContextMenu.DeveloperTools')}`,
        id: `${workspace.id}-devtool`,
        click: async () => {
          const view = this.viewService.getView(workspace.id, WindowNames.main);
          if (view !== undefined) {
            view.webContents.toggleDevTools();
          }
        },
      },
    ]);
    await this.menuService.insertMenu('Workspaces', newMenuItems, undefined, undefined, 'updateWorkspaceMenuItems');
  }

  /**
   * load workspaces in sync, and ensure it is an Object
   */
  getInitWorkspacesForCache = (): Record<string, IWorkspace> => {
    const workspacesFromDisk = settings.getSync(`workspaces`) ?? {};
    return typeof workspacesFromDisk === 'object' && !Array.isArray(workspacesFromDisk)
      ? mapValues(pickBy(workspacesFromDisk, (value) => value !== null) as unknown as Record<string, IWorkspace>, (workspace) =>
          this.sanitizeWorkspace(workspace),
        )
      : {};
  };

  public async getWorkspaces(): Promise<Record<string, IWorkspace>> {
    return this.getWorkspacesSync();
  }

  private getWorkspacesSync(): Record<string, IWorkspace> {
    return this.workspaces;
  }

  public async countWorkspaces(): Promise<number> {
    return Object.keys(this.workspaces).length;
  }

  /**
   * Get sorted workspace list
   * Async so proxy type is async
   */
  public async getWorkspacesAsList(): Promise<IWorkspace[]> {
    return Object.values(this.workspaces).sort(workspaceSorter);
  }

  /**
   * Get sorted workspace list
   * Sync for internal use
   */
  private getWorkspacesAsListSync(): IWorkspace[] {
    return Object.values(this.workspaces).sort(workspaceSorter);
  }

  public async get(id: string): Promise<IWorkspace | undefined> {
    return this.workspaces[id];
  }

  public get$(id: string): Observable<IWorkspace | undefined> {
    return this.workspaces$.pipe(map((workspaces) => workspaces[id]));
  }

  public async set(id: string, workspace: IWorkspace, immediate?: boolean): Promise<void> {
    this.workspaces[id] = this.sanitizeWorkspace(workspace);
    await this.reactBeforeWorkspaceChanged(workspace);
    if (immediate === true) {
      await settings.set(`workspaces.${id}`, { ...workspace });
    } else {
      void debouncedSetSettingFile(this.workspaces);
    }
    await this.updateWorkspaceSubject();
    await this.updateWorkspaceMenuItems();
  }

  public async update(id: string, workspaceSetting: Partial<IWorkspace>, immediate?: boolean): Promise<void> {
    const workspace = await this.get(id);
    if (workspace === undefined) {
      logger.error(`Could not update workspace ${id} because it does not exist`);
      return;
    }
    await this.set(id, { ...workspace, ...workspaceSetting }, immediate);
  }

  public async setWorkspaces(newWorkspaces: Record<string, IWorkspace>): Promise<void> {
    for (const id in newWorkspaces) {
      await this.set(id, newWorkspaces[id]);
    }
  }

  /**
   * Pure function that make sure workspace setting is consistent
   * @param workspaceToSanitize User input workspace or loaded workspace, that may contains bad values
   */
  private sanitizeWorkspace(workspaceToSanitize: IWorkspace): IWorkspace {
    const defaultValues: Partial<IWorkspace> = {
      storageService: SupportedStorageServices.github,
    };
    const fixingValues: Partial<IWorkspace> = {};
    // we add mainWikiID in creation, we fix this value for old existed workspaces
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (workspaceToSanitize.isSubWiki && !workspaceToSanitize.mainWikiID) {
      const mainWorkspace = (this.getWorkspacesAsListSync() ?? []).find(
        (workspaceToSearch) => workspaceToSanitize.mainWikiToLink === workspaceToSearch.wikiFolderLocation,
      );
      if (mainWorkspace !== undefined) {
        fixingValues.mainWikiID = mainWorkspace.id;
      }
    }
    return { ...defaultValues, ...workspaceToSanitize, ...fixingValues };
  }

  /**
   * Do some side effect before config change, update other services or filesystem, with new and old values
   * This happened after values sanitized
   * @param newWorkspaceConfig new workspace settings
   */
  private async reactBeforeWorkspaceChanged(newWorkspaceConfig: IWorkspace): Promise<void> {
    const { id, tagName } = newWorkspaceConfig;
    if (this.workspaces[id]?.isSubWiki && typeof tagName === 'string' && tagName.length > 0 && this.workspaces[id].tagName !== tagName) {
      const { mainWikiToLink } = this.workspaces[id];
      if (typeof mainWikiToLink !== 'string') {
        throw new TypeError(
          `mainWikiToLink is null in reactBeforeWorkspaceChanged when try to updateSubWikiPluginContent, workspacesID: ${id}\n${JSON.stringify(
            this.workspaces,
          )}`,
        );
      }
      await this.wikiService.updateSubWikiPluginContent(mainWikiToLink, newWorkspaceConfig, {
        ...newWorkspaceConfig,
        tagName: this.workspaces[id].tagName,
      });
      await this.wikiService.wikiStartup(newWorkspaceConfig);
    }
  }

  public async getByWikiFolderLocation(wikiFolderLocation: string): Promise<IWorkspace | undefined> {
    return (await this.getWorkspacesAsList()).find((workspace) => workspace.wikiFolderLocation === wikiFolderLocation);
  }

  public getPreviousWorkspace = async (id: string): Promise<IWorkspace | undefined> => {
    const workspaceList = await this.getWorkspacesAsList();
    let currentWorkspaceIndex = 0;
    for (const [index, workspace] of workspaceList.entries()) {
      if (workspace.id === id) {
        currentWorkspaceIndex = index;
        break;
      }
    }
    if (currentWorkspaceIndex === 0) {
      return workspaceList[workspaceList.length - 1];
    }
    return workspaceList[currentWorkspaceIndex - 1];
  };

  public getNextWorkspace = async (id: string): Promise<IWorkspace | undefined> => {
    const workspaceList = await this.getWorkspacesAsList();
    let currentWorkspaceIndex = 0;
    for (const [index, workspace] of workspaceList.entries()) {
      if (workspace.id === id) {
        currentWorkspaceIndex = index;
        break;
      }
    }
    if (currentWorkspaceIndex === workspaceList.length - 1) {
      return workspaceList[0];
    }
    return workspaceList[currentWorkspaceIndex + 1];
  };

  public getActiveWorkspace = async (): Promise<IWorkspace | undefined> => {
    return (await this.getWorkspacesAsList()).find((workspace) => workspace.active);
  };

  public getFirstWorkspace = async (): Promise<IWorkspace | undefined> => {
    return (await this.getWorkspacesAsList())[0];
  };

  public async setActiveWorkspace(id: string): Promise<void> {
    // active new one
    await this.update(id, { active: true, hibernated: false });
    // de-active the other one
    await Promise.all(
      this.getWorkspacesAsListSync()
        .filter((workspace) => workspace.id !== id)
        .map(async (workspace) => {
          await this.update(workspace.id, { active: false });
        }),
    );
  }

  /**
   *
   * @param id workspace id
   * @param sourcePicturePath image path, could be an image in app's resource folder or temp folder, we will copy it into app data folder
   */
  public async setWorkspacePicture(id: string, sourcePicturePath: string): Promise<void> {
    const workspace = await this.get(id);
    if (workspace === undefined) {
      throw new Error(`Try to setWorkspacePicture() but this workspace is not existed ${id}`);
    }
    const pictureID = uuid();

    if (workspace.picturePath === sourcePicturePath) {
      return;
    }

    const destinationPicturePath = path.join(app.getPath('userData'), 'pictures', `${pictureID}.png`);

    const newImage = await Jimp.read(sourcePicturePath);
    await new Promise((resolve) => {
      newImage.clone().resize(128, 128).quality(100).write(destinationPicturePath, resolve);
    });
    const currentPicturePath = (await this.get(id))?.picturePath;
    await this.update(id, {
      picturePath: destinationPicturePath,
    });
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (currentPicturePath) {
      try {
        return await fsExtra.remove(currentPicturePath);
      } catch (error) {
        console.error(error);
      }
    }
  }

  public async removeWorkspacePicture(id: string): Promise<void> {
    const workspace = await this.get(id);
    if (workspace === undefined) {
      throw new Error(`Try to removeWorkspacePicture() but this workspace is not existed ${id}`);
    }
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (workspace.picturePath) {
      await fsExtra.remove(workspace.picturePath);
      await this.set(id, {
        ...workspace,
        picturePath: null,
      });
    }
  }

  public async remove(id: string): Promise<void> {
    const { wikiFolderLocation } = this.workspaces[id];
    if (id in this.workspaces) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.workspaces[id];
      await settings.unset(`workspaces.${id}`);
    } else {
      throw new Error(`Try to remote workspace, but id ${id} is not existed`);
    }
    // call wiki service
    await this.wikiService.stopWiki(wikiFolderLocation);
    await this.wikiService.stopWatchWiki(wikiFolderLocation);
    await this.updateWorkspaceMenuItems();
    await this.updateWorkspaceSubject();
  }

  public async create(newWorkspaceConfig: INewWorkspaceConfig): Promise<IWorkspace> {
    const newID = uuid();

    // find largest order
    const workspaceLst = await this.getWorkspacesAsList();
    let max = 0;
    for (const element of workspaceLst) {
      if (element.order > max) {
        max = element.order;
      }
    }

    const newWorkspace: IWorkspace = {
      userName: '',
      ...newWorkspaceConfig,
      active: false,
      disableAudio: false,
      disableNotifications: false,
      hibernated: false,
      hibernateWhenUnused: false,
      homeUrl: `http://${defaultServerIP}:${newWorkspaceConfig.port}`,
      id: newID,
      lastUrl: null,
      order: max + 1,
      picturePath: null,
      subWikiFolderName: 'subwiki',
      syncOnInterval: false,
      syncOnIntervalDebounced: false,
      syncOnStartup: true,
      transparentBackground: false,
    };

    await this.set(newID, newWorkspace);

    return newWorkspace;
  }

  /** to keep workspace variables (meta) that
   * are not saved to disk
   * badge count, error, etc
   */
  private metaData: Record<string, Partial<IWorkspaceMetaData>> = {};

  public getMetaData = async (id: string): Promise<Partial<IWorkspaceMetaData>> => this.getMetaDataSync(id);
  private readonly getMetaDataSync = (id: string): Partial<IWorkspaceMetaData> => this.metaData[id] ?? {};

  public getAllMetaData = async (): Promise<Record<string, Partial<IWorkspaceMetaData>>> => this.metaData;

  public updateMetaData = async (id: string, options: Partial<IWorkspaceMetaData>): Promise<void> => {
    this.metaData[id] = {
      ...this.metaData[id],
      ...options,
    };
  };

  public async workspaceDidFailLoad(id: string): Promise<boolean> {
    const workspaceMetaData = this.getMetaDataSync(id);
    return typeof workspaceMetaData?.didFailLoadErrorMessage === 'string' && workspaceMetaData.didFailLoadErrorMessage.length > 0;
  }
}
