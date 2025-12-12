import { app } from 'electron';
import fsExtra from 'fs-extra';
import { injectable } from 'inversify';
import { Jimp } from 'jimp';
import { mapValues, pickBy } from 'lodash';
import { nanoid } from 'nanoid';
import path from 'path';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { WikiChannel } from '@/constants/channels';
import { defaultCreatedPageTypes, PageType } from '@/constants/pageTypes';
import { DELAY_MENU_REGISTER } from '@/constants/parameters';
import { getDefaultTidGiUrl } from '@/constants/urls';
import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { i18n } from '@services/libs/i18n';
import { logger } from '@services/libs/log';
import type { IMenuService } from '@services/menu/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type {
  IDedicatedWorkspace,
  INewWikiWorkspaceConfig,
  IWikiWorkspace,
  IWorkspace,
  IWorkspaceMetaData,
  IWorkspaceService,
  IWorkspacesWithMetadata,
  IWorkspaceWithMetadata,
} from './interface';
import { isWikiWorkspace } from './interface';
import { registerMenu } from './registerMenu';
import { workspaceSorter } from './utilities';

@injectable()
export class Workspace implements IWorkspaceService {
  /**
   * Record from workspace id to workspace settings
   */
  private workspaces: Record<string, IWorkspace> | undefined;
  public workspaces$ = new BehaviorSubject<IWorkspacesWithMetadata | undefined>(undefined);

  constructor() {
    setTimeout(() => {
      void registerMenu();
    }, DELAY_MENU_REGISTER);
  }

  public getWorkspacesWithMetadata(): IWorkspacesWithMetadata {
    return mapValues(this.getWorkspacesSync(), (workspace: IWorkspace, id): IWorkspaceWithMetadata => {
      // Only wiki workspaces can have metadata, dedicated workspaces are filtered out
      if (!isWikiWorkspace(workspace)) {
        return { ...workspace, metadata: this.getMetaDataSync(id) } as IWorkspaceWithMetadata;
      }
      return { ...workspace, metadata: this.getMetaDataSync(id) };
    });
  }

  public updateWorkspaceSubject(): void {
    this.workspaces$.next(this.getWorkspacesWithMetadata());
  }

  /**
   * Update items like "activate workspace1" or "open devtool in workspace1" in the menu
   */
  private async updateWorkspaceMenuItems(): Promise<void> {
    const newMenuItems = (await this.getWorkspacesAsList()).flatMap((workspace, index) => [
      {
        label: (): string => workspace.name || `Workspace ${index + 1}`,
        id: workspace.id,
        type: 'checkbox' as const,
        checked: () => workspace.active,
        click: async (): Promise<void> => {
          const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
          await workspaceViewService.setActiveWorkspaceView(workspace.id);
          // manually update menu since we have alter the active workspace
          const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
          await menuService.buildMenu();
        },
        accelerator: `CmdOrCtrl+${index + 1}`,
      },
      {
        label: () => `${workspace.name || `Workspace ${index + 1}`} ${i18n.t('Menu.DeveloperToolsActiveWorkspace')}`,
        id: `${workspace.id}-devtool`,
        click: async () => {
          const viewService = container.get<IViewService>(serviceIdentifier.View);
          const view = viewService.getView(workspace.id, WindowNames.main);
          if (view !== undefined) {
            view.webContents.toggleDevTools();
          }
        },
      },
    ]);

    const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
    await menuService.insertMenu('Workspaces', newMenuItems, undefined, undefined, 'updateWorkspaceMenuItems');
  }

  /**
   * load workspaces in sync, and ensure it is an Object
   */
  private getInitWorkspacesForCache(): Record<string, IWorkspace> {
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    const workspacesFromDisk = databaseService.getSetting(`workspaces`) ?? {};
    return typeof workspacesFromDisk === 'object' && !Array.isArray(workspacesFromDisk)
      ? mapValues(pickBy(workspacesFromDisk, (value) => !!value), (workspace) => this.sanitizeWorkspace(workspace))
      : {};
  }

  public async getWorkspaces(): Promise<Record<string, IWorkspace>> {
    return this.getWorkspacesSync();
  }

  private getWorkspacesSync(): Record<string, IWorkspace> {
    // store in memory to boost performance
    if (this.workspaces === undefined) {
      this.workspaces = this.getInitWorkspacesForCache();
    }
    return this.workspaces;
  }

  public async countWorkspaces(): Promise<number> {
    return Object.keys(this.getWorkspacesSync()).length;
  }

  /**
   * Get sorted workspace list
   * Async so proxy type is async
   */
  public async getWorkspacesAsList(): Promise<IWorkspace[]> {
    return Object.values(this.getWorkspacesSync()).sort(workspaceSorter);
  }

  /**
   * Get sorted workspace list
   * Sync for internal use
   */
  private getWorkspacesAsListSync(): IWorkspace[] {
    return Object.values(this.getWorkspacesSync()).sort(workspaceSorter);
  }

  public async getSubWorkspacesAsList(workspaceID: string): Promise<IWikiWorkspace[]> {
    const workspace = this.getSync(workspaceID);
    if (workspace === undefined || !isWikiWorkspace(workspace)) return [];
    if (workspace.isSubWiki) return [];
    return this.getWorkspacesAsListSync().filter((w): w is IWikiWorkspace => isWikiWorkspace(w) && w.mainWikiID === workspaceID).sort(workspaceSorter);
  }

  public getSubWorkspacesAsListSync(workspaceID: string): IWikiWorkspace[] {
    const workspace = this.getSync(workspaceID);
    if (workspace === undefined || !isWikiWorkspace(workspace)) return [];
    if (workspace.isSubWiki) return [];
    return this.getWorkspacesAsListSync().filter((w): w is IWikiWorkspace => isWikiWorkspace(w) && w.mainWikiID === workspaceID).sort(workspaceSorter);
  }

  public async get(id: string): Promise<IWorkspace | undefined> {
    return this.getSync(id);
  }

  private getSync(id: string): IWorkspace | undefined {
    const workspaces = this.getWorkspacesSync();
    if (id in workspaces) {
      return workspaces[id];
    }
    // Try find with lowercased key. sometimes user will use id that is all lowercased. Because tidgi:// url is somehow lowercased.
    const foundKey = Object.keys(workspaces).find((key) => key.toLowerCase() === id.toLowerCase());
    return foundKey ? workspaces[foundKey] : undefined;
  }

  public get$(id: string): Observable<IWorkspace | undefined> {
    return this.workspaces$.pipe(map((workspaces) => workspaces?.[id]));
  }

  public async set(id: string, workspace: IWorkspace, immediate?: boolean): Promise<void> {
    const workspaces = this.getWorkspacesSync();
    const workspaceToSave = this.sanitizeWorkspace(workspace);
    await this.reactBeforeWorkspaceChanged(workspaceToSave);
    workspaces[id] = workspaceToSave;
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    databaseService.setSetting('workspaces', workspaces);
    if (immediate === true) {
      await databaseService.immediatelyStoreSettingsToFile();
    }
    // update subject so ui can react to it
    this.updateWorkspaceSubject();
    // menu is mostly invisible, so we don't need to update it immediately
    void this.updateWorkspaceMenuItems();
  }

  public async update(id: string, workspaceSetting: Partial<IWorkspace>, immediate?: boolean): Promise<void> {
    const workspace = this.getSync(id);
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

  public getMainWorkspace(subWorkspace: IWorkspace): IWorkspace | undefined {
    if (!isWikiWorkspace(subWorkspace)) return undefined;
    const { mainWikiID, isSubWiki, mainWikiToLink } = subWorkspace;
    if (!isSubWiki) return undefined;
    if (mainWikiID) return this.getSync(mainWikiID);
    const mainWorkspace = this.getWorkspacesAsListSync().find(
      (workspaceToSearch) => isWikiWorkspace(workspaceToSearch) && mainWikiToLink === workspaceToSearch.wikiFolderLocation,
    );
    return mainWorkspace;
  }

  /**
   * Pure function that make sure workspace setting is consistent, or doing migration across updates
   * @param workspaceToSanitize User input workspace or loaded workspace, that may contains bad values
   */
  private sanitizeWorkspace(workspaceToSanitize: IWorkspace): IWorkspace {
    // For dedicated workspaces (help, guide, agent), no sanitization needed
    if (!isWikiWorkspace(workspaceToSanitize)) {
      return workspaceToSanitize;
    }

    const defaultValues: Partial<typeof workspaceToSanitize> = {
      storageService: SupportedStorageServices.github,
      backupOnInterval: true,
      excludedPlugins: [],
      enableHTTPAPI: false,
      includeTagTree: false,
      fileSystemPathFilterEnable: false,
      fileSystemPathFilter: null,
      tagNames: [],
      ignoreSymlinks: true,
    };
    const fixingValues: Partial<typeof workspaceToSanitize> = {};
    // we add mainWikiID in creation, we fix this value for old existed workspaces
    if (workspaceToSanitize.isSubWiki && !workspaceToSanitize.mainWikiID) {
      const mainWorkspace = this.getMainWorkspace(workspaceToSanitize);
      if (mainWorkspace !== undefined) {
        fixingValues.mainWikiID = mainWorkspace.id;
      }
    }
    // Migrate old tagName (string) to tagNames (string[])

    const legacyTagName = (workspaceToSanitize as { tagName?: string | null }).tagName;
    if (legacyTagName && (!workspaceToSanitize.tagNames || workspaceToSanitize.tagNames.length === 0)) {
      fixingValues.tagNames = [legacyTagName.replaceAll('\n', '')];
    }
    // before 0.8.0, tidgi was loading http content, so lastUrl will be http protocol, but later we switch to tidgi:// protocol, so old value can't be used.
    if (!workspaceToSanitize.lastUrl?.startsWith('tidgi')) {
      fixingValues.lastUrl = null;
    }
    if (!workspaceToSanitize.homeUrl.startsWith('tidgi')) {
      fixingValues.homeUrl = getDefaultTidGiUrl(workspaceToSanitize.id);
    }
    if (workspaceToSanitize.tokenAuth && !workspaceToSanitize.authToken) {
      const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
      fixingValues.authToken = authService.generateOneTimeAdminAuthTokenForWorkspaceSync(workspaceToSanitize.id);
    }
    return { ...defaultValues, ...workspaceToSanitize, ...fixingValues };
  }

  /**
   * Do some side effect before config change, update other services or filesystem, with new and old values
   * This happened after values sanitized
   * @param newWorkspaceConfig new workspace settings
   */
  private async reactBeforeWorkspaceChanged(newWorkspaceConfig: IWorkspace): Promise<void> {
    if (!isWikiWorkspace(newWorkspaceConfig)) return;

    const existedWorkspace = this.getSync(newWorkspaceConfig.id);
    const { id, tagNames } = newWorkspaceConfig;
    // when update tagNames of subWiki
    if (
      existedWorkspace !== undefined && isWikiWorkspace(existedWorkspace) && existedWorkspace.isSubWiki && tagNames.length > 0 &&
      JSON.stringify(existedWorkspace.tagNames) !== JSON.stringify(tagNames)
    ) {
      const { mainWikiToLink } = existedWorkspace;
      if (typeof mainWikiToLink !== 'string') {
        throw new TypeError(
          `mainWikiToLink is null in reactBeforeWorkspaceChanged when try to updateSubWikiPluginContent, workspacesID: ${id}\n${
            JSON.stringify(
              this.workspaces,
            )
          }`,
        );
      }
    }
  }

  public async getByWikiFolderLocation(wikiFolderLocation: string): Promise<IWorkspace | undefined> {
    return (await this.getWorkspacesAsList()).find((workspace) => isWikiWorkspace(workspace) && workspace.wikiFolderLocation === wikiFolderLocation);
  }

  public async getByWikiName(wikiName: string): Promise<IWorkspace | undefined> {
    return (await this.getWorkspacesAsList())
      .sort(workspaceSorter)
      .find((workspace) => workspace.name === wikiName);
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
      return workspaceList.at(-1);
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
    return this.getActiveWorkspaceSync();
  };

  public getActiveWorkspaceSync = (): IWorkspace | undefined => {
    return this.getWorkspacesAsListSync().find((workspace) => workspace.active);
  };

  public getFirstWorkspace = async (): Promise<IWorkspace | undefined> => {
    return this.getFirstWorkspaceSync();
  };

  public getFirstWorkspaceSync = (): IWorkspace | undefined => {
    return this.getWorkspacesAsListSync()[0];
  };

  public async setActiveWorkspace(id: string, oldActiveWorkspaceID: string | undefined): Promise<void> {
    const newWorkspace = this.getSync(id);
    if (!newWorkspace) {
      throw new Error(`Workspace with id ${id} not found`);
    }

    // active new one
    if (isWikiWorkspace(newWorkspace)) {
      await this.update(id, { active: true, hibernated: false });
    } else {
      await this.update(id, { active: true });
    }
    // de-active the other one
    if (oldActiveWorkspaceID !== id) {
      await this.clearActiveWorkspace(oldActiveWorkspaceID);
    }
  }

  public async clearActiveWorkspace(oldActiveWorkspaceID: string | undefined): Promise<void> {
    // de-active the other one
    if (typeof oldActiveWorkspaceID === 'string') {
      await this.update(oldActiveWorkspaceID, { active: false });
    }
  }

  /**
   * @param id workspace id
   * @param sourcePicturePath image path, could be an image in app's resource folder or temp folder, we will copy it into app data folder
   */
  public async setWorkspacePicture(id: string, sourcePicturePath: string): Promise<void> {
    const workspace = this.getSync(id);
    if (workspace === undefined) {
      throw new Error(`Try to setWorkspacePicture() but this workspace is not existed ${id}`);
    }
    const pictureID = nanoid();

    if (workspace.picturePath === sourcePicturePath) {
      return;
    }

    const destinationPicturePath = path.join(app.getPath('userData'), 'pictures', `${pictureID}.png`) as `${string}.${string}`;

    const newImage = await Jimp.read(sourcePicturePath);
    await newImage.clone().resize({ w: 128, h: 128 }).write(destinationPicturePath);
    const currentPicturePath = this.getSync(id)?.picturePath;
    await this.update(id, {
      picturePath: destinationPicturePath,
    });
    if (currentPicturePath) {
      try {
        await fsExtra.remove(currentPicturePath);
      } catch (error) {
        console.error(error);
      }
    }
  }

  public async removeWorkspacePicture(id: string): Promise<void> {
    const workspace = this.getSync(id);
    if (workspace === undefined) {
      throw new Error(`Try to removeWorkspacePicture() but this workspace is not existed ${id}`);
    }
    if (workspace.picturePath) {
      await fsExtra.remove(workspace.picturePath);
      await this.set(id, {
        ...workspace,
        picturePath: null,
      });
    }
  }

  public async remove(id: string): Promise<void> {
    const workspaces = this.getWorkspacesSync();
    if (id in workspaces) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete workspaces[id];
      const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
      databaseService.setSetting('workspaces', workspaces);
    } else {
      throw new Error(`Try to remote workspace, but id ${id} is not existed`);
    }
    this.updateWorkspaceSubject();
    void this.updateWorkspaceMenuItems();
  }

  public async create(newWorkspaceConfig: INewWikiWorkspaceConfig): Promise<IWorkspace> {
    const newID = nanoid();
    const newWorkspace: IWorkspace = {
      userName: '',
      ...newWorkspaceConfig,
      active: false,
      hibernated: false,
      hibernateWhenUnused: false,
      homeUrl: getDefaultTidGiUrl(newID),
      id: newID,
      lastUrl: null,
      lastNodeJSArgv: [],
      order: typeof newWorkspaceConfig.order === 'number' ? newWorkspaceConfig.order : ((await this.getWorkspacesAsList()).length + 1),
      picturePath: null,
      subWikiFolderName: 'subwiki',
      syncOnInterval: false,
      syncOnStartup: true,
      transparentBackground: false,
      enableHTTPAPI: false,
      excludedPlugins: [],
      enableFileSystemWatch: true,
    };

    await this.set(newID, newWorkspace);

    return newWorkspace;
  }

  public async createPageWorkspace(pageType: PageType, order: number, active = false): Promise<IWorkspace> {
    const pageWorkspace: IDedicatedWorkspace = {
      id: pageType,
      name: pageType,
      pageType,
      active,
      order,
      picturePath: null,
    };

    await this.set(pageType, pageWorkspace);
    return pageWorkspace;
  }

  /**
   * Initialize default page workspaces on first startup
   */
  public async initializeDefaultPageWorkspaces(): Promise<void> {
    try {
      const existingWorkspaces = await this.getWorkspacesAsList();

      // Find the maximum order to place page workspaces after regular workspaces
      const maxWorkspaceOrder = existingWorkspaces.reduce((max, workspace) => workspace.pageType ? max : Math.max(max, workspace.order), -1);

      const currentOrder = maxWorkspaceOrder + 1;

      for (const [index, pageType] of defaultCreatedPageTypes.entries()) {
        // Check if page workspace already exists
        const existingPageWorkspace = existingWorkspaces.find(w => w.pageType === pageType);
        if (!existingPageWorkspace) {
          // Create page workspace with appropriate order
          await this.createPageWorkspace(pageType, currentOrder + index, false);
          logger.info(`Created default page workspace for ${pageType}`);
        }
      }

      logger.info('Successfully initialized default page workspaces');
    } catch (error) {
      logger.error('Failed to initialize default page workspaces:', error);
      throw error;
    }
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
    logger.debug('updateMetaData', {
      id,
      options,
      function: 'updateMetaData',
    });
    this.metaData[id] = {
      ...this.metaData[id],
      ...options,
    };
    this.updateWorkspaceSubject();
  };

  public async workspaceDidFailLoad(id: string): Promise<boolean> {
    const workspaceMetaData = this.getMetaDataSync(id);
    return typeof workspaceMetaData.didFailLoadErrorMessage === 'string' && workspaceMetaData.didFailLoadErrorMessage.length > 0;
  }

  public async openWorkspaceTiddler(workspace: IWorkspace, title?: string): Promise<void> {
    const { id: idToActive, pageType } = workspace;
    const oldActiveWorkspace = await this.getActiveWorkspace();

    // Handle page workspace - no special action needed as routing handles the page display
    if (pageType) {
      return;
    }

    // Only handle wiki workspaces
    if (!isWikiWorkspace(workspace)) return;

    const { isSubWiki, mainWikiID, tagNames } = workspace;

    logger.log('debug', 'openWorkspaceTiddler', { workspace });
    // If is main wiki, open the wiki, and open provided title, or simply switch to it if no title provided
    if (!isSubWiki && idToActive) {
      const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
      const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
      if (oldActiveWorkspace?.id !== idToActive) {
        await workspaceViewService.setActiveWorkspaceView(idToActive);
      }
      if (title) {
        await wikiService.wikiOperationInBrowser(WikiChannel.openTiddler, idToActive, [title]);
      }
      return;
    }
    // If is sub wiki, open the main wiki first and open the tag or provided title
    if (isSubWiki && mainWikiID) {
      const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
      const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
      if (oldActiveWorkspace?.id !== mainWikiID) {
        await workspaceViewService.setActiveWorkspaceView(mainWikiID);
      }
      // Use provided title, or first tag name, or nothing
      const subWikiTag = title ?? tagNames[0];
      if (subWikiTag) {
        await wikiService.wikiOperationInBrowser(WikiChannel.openTiddler, mainWikiID, [subWikiTag]);
      }
    }
  }

  public async exists(id: string): Promise<boolean> {
    return Boolean(await this.get(id));
  }
}
