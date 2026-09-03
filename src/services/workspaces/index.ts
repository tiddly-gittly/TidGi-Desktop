import { app } from 'electron';
import fsExtra from 'fs-extra';
import { injectable } from 'inversify';
import { Jimp } from 'jimp';
import { isEqual, mapValues } from 'lodash';
import { nanoid } from 'nanoid';
import path from 'path';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { WikiChannel } from '@/constants/channels';
import { defaultCreatedPageTypes, PageType } from '@/constants/pageTypes';
import { getDefaultTidGiUrl } from '@/constants/urls';
import type { IAnalyticsService } from '@services/analytics/interface';
import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import type { IMenuService } from '@services/menu/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import { extractSyncableConfig, mergeWithSyncedConfig, readTidgiConfig, readTidgiConfigSync, writeTidgiConfig } from '../database/configSetting';
import type {
  IDedicatedWorkspace,
  INewHtmlWikiWorkspaceConfig,
  INewWikiWorkspaceConfig,
  IWikiWorkspace,
  IWorkspace,
  IWorkspaceGroup,
  IWorkspaceMetaData,
  IWorkspaceService,
  IWorkspacesWithMetadata,
  IWorkspaceWithMetadata,
} from './interface';
import { isWikiWorkspace, wikiWorkspaceDefaultValues, WorkspaceType } from './interface';
import { registerMenu } from './registerMenu';
import { workspaceSorter } from './utilities';
import { isHtmlWikiWorkspace, normalizeHtmlWorkspacePaths } from './workspacePaths';

@injectable()
export class Workspace implements IWorkspaceService {
  /**
   * Record from workspace id to workspace settings
   */
  protected workspaces: Record<string, IWorkspace> | undefined;
  public workspaces$ = new BehaviorSubject<IWorkspacesWithMetadata | undefined>(undefined);
  /**
   * Serialize mutations of the same workspace. Persistence is asynchronous, so
   * two partial updates must not both merge against the same stale snapshot.
   */
  private readonly workspaceMutationQueues = new Map<string, Promise<void>>();

  /**
   * Initialize workspace menu after database is ready
   * Called from main.ts after databaseService.initializeForApp()
   */
  public async initializeMenu(): Promise<void> {
    await registerMenu();
  }

  private previousWorkspacesWithMetadata: IWorkspacesWithMetadata | undefined;

  public getWorkspacesWithMetadata(): IWorkspacesWithMetadata {
    return mapValues(this.getWorkspacesSync(), (workspace: IWorkspace, id): IWorkspaceWithMetadata => {
      // Only wiki workspaces can have metadata, dedicated workspaces are filtered out
      if (!isWikiWorkspace(workspace)) {
        return { ...workspace, metadata: this.getMetaDataSync(id) };
      }
      return { ...workspace, metadata: this.getMetaDataSync(id) };
    });
  }

  public updateWorkspaceSubject(): void {
    const next = this.getWorkspacesWithMetadata();
    // Skip emission when nothing actually changed to break infinite render loops
    // caused by unstable object references in renderer-side dnd-kit hooks.
    if (this.previousWorkspacesWithMetadata !== undefined && isEqual(this.previousWorkspacesWithMetadata, next)) {
      return;
    }
    this.previousWorkspacesWithMetadata = next;
    this.workspaces$.next(next);
    // Also initialize groups observable
    this.getGroupsSync();
  }

  /**
   * Update items like "activate workspace1" or "open devtool in workspace1" in the menu
   */
  private async updateWorkspaceMenuItems(): Promise<void> {
    const newMenuItems = (await this.getWorkspacesAsList()).filter((workspace) => isWikiWorkspace(workspace)).flatMap((workspace, index) => [
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
    logger.debug('getInitWorkspacesForCache: Loading workspaces from settings.json', {
      workspaceIds: typeof workspacesFromDisk === 'object' ? Object.keys(workspacesFromDisk) : 'invalid',
    });
    if (typeof workspacesFromDisk === 'object' && workspacesFromDisk !== null && !Array.isArray(workspacesFromDisk)) {
      const sanitizedWorkspaces = Object.create(null) as Record<string, IWorkspace>;
      const workspaceEntries = Object.entries(workspacesFromDisk);
      for (const [storageKey, workspace] of workspaceEntries) {
        logger.debug('getInitWorkspacesForCache: Sanitizing workspace', { storageKey });
        if (typeof workspace !== 'object' || workspace === null || Array.isArray(workspace)) {
          logger.warn('getInitWorkspacesForCache: Ignoring invalid workspace entry', { storageKey });
          continue;
        }
        if (typeof workspace.id !== 'string' || workspace.id.trim() === '' || workspace.id !== storageKey) {
          logger.warn('getInitWorkspacesForCache: Ignoring workspace with missing or mismatched id', {
            storageKey,
            workspaceID: workspace.id,
          });
          continue;
        }

        try {
          const sanitized = this.sanitizeWorkspace(workspace, true);
          const normalizedID = sanitized.id;
          if (Object.hasOwn(sanitizedWorkspaces, normalizedID)) {
            logger.warn('getInitWorkspacesForCache: Ignoring duplicate workspace id', {
              storageKey,
              normalizedID,
            });
            continue;
          }
          sanitizedWorkspaces[normalizedID] = sanitized;
          logger.debug('getInitWorkspacesForCache: Sanitized workspace', {
            storageKey,
            normalizedID,
            hasName: 'name' in sanitized,
            name: sanitized.name,
            hasPort: 'port' in sanitized,
            port: (sanitized as { port?: number }).port,
          });
        } catch (error) {
          logger.warn('getInitWorkspacesForCache: Ignoring workspace that could not be sanitized', {
            error,
            storageKey,
          });
        }
      }

      const resolveRootWorkspaceID = (subWorkspace: IWikiWorkspace): string | undefined => {
        let targetID = subWorkspace.mainWikiID;
        const visited = new Set([subWorkspace.id]);
        while (targetID) {
          if (visited.has(targetID)) return undefined;
          visited.add(targetID);
          const target = sanitizedWorkspaces[targetID];
          if (!target || !isWikiWorkspace(target)) return undefined;
          if (!target.isSubWiki) return target.id;
          targetID = target.mainWikiID;
        }
        return undefined;
      };

      Object.values(sanitizedWorkspaces).forEach((workspace) => {
        if (!isWikiWorkspace(workspace) || !workspace.isSubWiki) return;

        const explicitRootID = resolveRootWorkspaceID(workspace);
        if (explicitRootID) {
          workspace.mainWikiID = explicitRootID;
          return;
        }

        if (workspace.mainWikiID) {
          logger.warn('getInitWorkspacesForCache: Clearing invalid subwiki link in memory', {
            mainWikiID: workspace.mainWikiID,
            workspaceID: workspace.id,
          });
        }
        workspace.mainWikiID = null;
      });

      return sanitizedWorkspaces;
    }
    return {};
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
    return workspaces[id];
  }

  public get$(id: string): Observable<IWorkspace | undefined> {
    return this.workspaces$.pipe(map((workspaces) => workspaces?.[id]));
  }

  private async runWorkspaceMutation(id: string, mutation: () => Promise<void>): Promise<void> {
    const previousMutation = this.workspaceMutationQueues.get(id) ?? Promise.resolve();
    const queuedMutation = previousMutation
      .catch(() => undefined)
      .then(mutation);
    this.workspaceMutationQueues.set(id, queuedMutation);

    try {
      await queuedMutation;
    } finally {
      if (this.workspaceMutationQueues.get(id) === queuedMutation) {
        this.workspaceMutationQueues.delete(id);
      }
    }
  }

  private async setWithinMutation(
    id: string,
    workspace: IWorkspace,
    immediate?: boolean,
    skipUiUpdate = false,
    persistedPatch?: Partial<IWorkspace>,
  ): Promise<void> {
    const workspaces = this.getWorkspacesSync();
    const workspaceToSave = this.sanitizeWorkspace(workspace);

    // Capture previous in-memory state for precise syncable-field diffing.
    const previousWorkspace = workspaces[id];

    // Transactional persistence: write to disk first, then update memory/UI only on success.
    // This prevents false "saved" feedback when disk writes fail.

    const shouldSyncToTidgiConfig = isWikiWorkspace(workspaceToSave) && workspaceToSave.useTidgiConfigSync;

    // Write tidgi.config.json only when syncable fields actually changed AND workspace uses tidgi.config.json sync.
    if (shouldSyncToTidgiConfig) {
      const newSyncableConfig = extractSyncableConfig(workspaceToSave);
      const previousSyncableConfig = previousWorkspace !== undefined && isWikiWorkspace(previousWorkspace)
        ? extractSyncableConfig(previousWorkspace)
        : undefined;
      const syncableChanged = previousSyncableConfig === undefined || !isEqual(newSyncableConfig, previousSyncableConfig);
      if (syncableChanged) {
        await writeTidgiConfig(workspaceToSave.wikiFolderLocation, newSyncableConfig);
      }
    }

    // Keep settings.json self-contained. Startup must never depend on synchronous
    // access to a wiki folder, which may be an unavailable network/external disk.
    // tidgi.config.json remains the portable copy imported explicitly by create().
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    const currentSettingsWorkspaces = databaseService.getSetting('workspaces') ?? {};
    // update() is also used for runtime-only startup fields such as hibernated,
    // lastUrl and lastNodeJSArgv. Merge only that explicit patch into the raw
    // persisted shape so runtime updates do not rewrite unrelated fields.
    currentSettingsWorkspaces[id] = persistedPatch === undefined
      ? workspaceToSave
      : { ...(currentSettingsWorkspaces[id] ?? {}), ...persistedPatch };
    databaseService.setSetting('workspaces', currentSettingsWorkspaces);
    if (immediate === true) {
      await databaseService.immediatelyStoreSettingsToFile();
    }

    // Update memory cache only after successful persistence
    workspaces[id] = workspaceToSave;

    // Update UI only after successful persistence
    if (!skipUiUpdate) {
      this.updateWorkspaceSubject();
      void this.updateWorkspaceMenuItems();
    }
  }

  public async set(id: string, workspace: IWorkspace, immediate?: boolean, skipUiUpdate = false): Promise<void> {
    await this.runWorkspaceMutation(id, async () => {
      await this.setWithinMutation(id, workspace, immediate, skipUiUpdate);
    });
  }

  public async update(id: string, workspaceSetting: Partial<IWorkspace>, immediate?: boolean): Promise<void> {
    await this.runWorkspaceMutation(id, async () => {
      const workspace = this.getSync(id);
      if (workspace === undefined) {
        logger.error(`Could not update workspace ${id} because it does not exist`);
        return;
      }
      await this.setWithinMutation(id, { ...workspace, ...workspaceSetting }, immediate, false, workspaceSetting);
    });
  }

  public async setWorkspaces(newWorkspaces: Record<string, IWorkspace>): Promise<void> {
    // Process all workspaces without triggering UI updates for each one
    const ids = Object.keys(newWorkspaces);
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      const isLast = index === ids.length - 1;
      // Skip UI update for all but the last workspace
      await this.set(id, newWorkspaces[id], false, !isLast);
    }
  }

  public getMainWorkspace(subWorkspace: IWorkspace): IWorkspace | undefined {
    if (!isWikiWorkspace(subWorkspace)) return undefined;
    const { mainWikiID, isSubWiki } = subWorkspace;
    return isSubWiki && mainWikiID ? this.getSync(mainWikiID) : undefined;
  }

  /**
   * Make sure workspace settings are internally consistent. Startup hydration
   * may read the portable tidgi.config.json, but hierarchy resolution remains a
   * separate second pass and therefore never recursively enters the cache.
   * @param workspaceToSanitize User input workspace or loaded workspace, that may contains bad values
   * @param hydratePortableConfig Apply tidgi.config.json fields during initial cache construction only
   */
  protected sanitizeWorkspace(workspaceToSanitize: IWorkspace, hydratePortableConfig = false): IWorkspace {
    // For dedicated workspaces (help, guide, agent), no sanitization needed
    if (!isWikiWorkspace(workspaceToSanitize)) {
      return workspaceToSanitize;
    }

    logger.debug('sanitizeWorkspace: Starting', {
      workspaceId: workspaceToSanitize.id,
      hasName: 'name' in workspaceToSanitize,
      inputName: workspaceToSanitize.name,
      hasPort: 'port' in workspaceToSanitize,
      inputPort: workspaceToSanitize.port,
      wikiFolderLocation: workspaceToSanitize.wikiFolderLocation,
    });

    const workspaceType = workspaceToSanitize.workspaceType;
    if (workspaceType !== WorkspaceType.folder && workspaceType !== WorkspaceType.html) {
      throw new Error('workspace_invalid_workspace_type');
    }

    // HTML workspaces never sync from tidgi.config.json
    const isHtmlWorkspace = workspaceType === WorkspaceType.html;

    let effectiveWorkspace = workspaceToSanitize;
    // Master stores portable fields such as name and sub-wiki relationships in
    // tidgi.config.json. Omitting this startup hydration silently replaces names
    // with folder basenames and erases the hierarchy from the in-memory cache.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
    if (hydratePortableConfig && !isHtmlWorkspace && workspaceToSanitize.useTidgiConfigSync !== false) {
      const portableConfig = readTidgiConfigSync(workspaceToSanitize.wikiFolderLocation);
      if (portableConfig !== undefined) {
        effectiveWorkspace = mergeWithSyncedConfig(workspaceToSanitize, portableConfig);
        logger.debug('sanitizeWorkspace: Hydrated portable config', {
          fields: Object.keys(portableConfig),
          workspaceId: workspaceToSanitize.id,
        });
      }
    }

    const canonicalHomeUrl = getDefaultTidGiUrl(effectiveWorkspace.id);
    const hasCanonicalLastUrl = effectiveWorkspace.lastUrl === null || (
      typeof effectiveWorkspace.lastUrl === 'string' &&
      effectiveWorkspace.lastUrl.startsWith(canonicalHomeUrl)
    );
    const hasHtmlFileLocation = typeof effectiveWorkspace.htmlFileLocation === 'string' && effectiveWorkspace.htmlFileLocation.trim() !== '';
    if (
      typeof effectiveWorkspace.id !== 'string' ||
      effectiveWorkspace.id.trim() === '' ||
      typeof effectiveWorkspace.name !== 'string' ||
      effectiveWorkspace.name.trim() === '' ||
      !Array.isArray(effectiveWorkspace.tagNames) ||
      !effectiveWorkspace.tagNames.every((tag) => typeof tag === 'string') ||
      effectiveWorkspace.homeUrl !== canonicalHomeUrl ||
      !hasCanonicalLastUrl ||
      (isHtmlWorkspace ? !hasHtmlFileLocation : hasHtmlFileLocation)
    ) {
      throw new Error('workspace_invalid_canonical_fields');
    }

    const fixingValues: Partial<typeof effectiveWorkspace> = {};
    if (effectiveWorkspace.tokenAuth && !effectiveWorkspace.authToken) {
      const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
      fixingValues.authToken = authService.generateOneTimeAdminAuthTokenForWorkspaceSync(effectiveWorkspace.id);
    }
    if (isHtmlWorkspace) {
      try {
        const htmlFileLocation = effectiveWorkspace.htmlFileLocation;
        if (typeof htmlFileLocation !== 'string' || htmlFileLocation.trim() === '') {
          throw new Error('workspace_invalid_canonical_fields');
        }
        const normalizedPaths = normalizeHtmlWorkspacePaths(htmlFileLocation);
        fixingValues.htmlFileLocation = normalizedPaths.htmlFileLocation;
        fixingValues.wikiFolderLocation = normalizedPaths.wikiFolderLocation;
        fixingValues.useTidgiConfigSync = false;
        fixingValues.isSubWiki = false;
        fixingValues.mainWikiID = null;
      } catch (error) {
        logger.warn('sanitizeWorkspace: Failed to normalize HTML workspace paths', {
          workspaceId: effectiveWorkspace.id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
    // Apply creation defaults, then canonical workspace data, then normalized values.
    const result = { ...wikiWorkspaceDefaultValues, ...effectiveWorkspace, ...fixingValues };
    logger.debug('sanitizeWorkspace: Complete', {
      workspaceId: result.id,
      finalName: result.name,
      finalPort: result.port,
    });
    return result;
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
      delete workspaces[id];
      const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
      const currentSettingsWorkspaces = databaseService.getSetting('workspaces') ?? {};
      delete currentSettingsWorkspaces[id];
      databaseService.setSetting('workspaces', currentSettingsWorkspaces);
    } else {
      throw new Error(`Try to remove workspace, but id ${id} does not exist`);
    }
    this.updateWorkspaceSubject();
    void this.updateWorkspaceMenuItems();
  }

  /**
   * Compute the order for a newly created wiki workspace so it appears at
   * the BOTTOM of the regular-workspace section (after existing page workspaces).
   */
  private async getNextInsertOrder(): Promise<number> {
    const all = await this.getWorkspacesAsList();
    const regularWorkspaces = all.filter(w => !w.pageType);
    if (regularWorkspaces.length === 0) return 0;
    const maxOrder = Math.max(...regularWorkspaces.map(w => w.order));
    return maxOrder + 1;
  }

  public async create(newWorkspaceConfig: INewWikiWorkspaceConfig): Promise<IWorkspace> {
    const isHtmlConfig = newWorkspaceConfig.workspaceType === WorkspaceType.html;
    const { useTidgiConfig = !isHtmlConfig, ...workspaceConfig } = newWorkspaceConfig;
    const generatedID = nanoid();
    let newID = generatedID;

    let normalizedHtmlPaths: ReturnType<typeof normalizeHtmlWorkspacePaths> | undefined;
    if (isHtmlConfig) {
      const htmlConfig = newWorkspaceConfig as INewHtmlWikiWorkspaceConfig;
      normalizedHtmlPaths = normalizeHtmlWorkspacePaths(htmlConfig.htmlFileLocation);
      workspaceConfig.wikiFolderLocation = normalizedHtmlPaths.wikiFolderLocation;
      workspaceConfig.htmlFileLocation = normalizedHtmlPaths.htmlFileLocation;
      workspaceConfig.workspaceType = WorkspaceType.html;
      if (!workspaceConfig.name || workspaceConfig.name.trim() === '') {
        workspaceConfig.name = path.basename(normalizedHtmlPaths.htmlFileLocation, path.extname(normalizedHtmlPaths.htmlFileLocation));
      }
    }

    // Read existing config from tidgi.config.json if it exists (for re-adding an existing wiki)
    // Synced config should take priority over the passed config for syncable fields
    // This allows users to restore their previous settings when re-adding a wiki
    let existingConfig: Partial<INewWikiWorkspaceConfig> = {};
    if (useTidgiConfig && workspaceConfig.wikiFolderLocation && !isHtmlConfig) {
      const syncedConfig = await readTidgiConfig(workspaceConfig.wikiFolderLocation);
      if (syncedConfig) {
        existingConfig = syncedConfig as Partial<INewWikiWorkspaceConfig>;
        const syncedWorkspaceID = (syncedConfig as { id?: unknown }).id;
        if (typeof syncedWorkspaceID === 'string' && syncedWorkspaceID.length > 0) {
          newID = syncedWorkspaceID;
        }
        logger.info('Applied synced config from tidgi.config.json during workspace creation', {
          wikiFolderLocation: workspaceConfig.wikiFolderLocation,
          syncedConfigFields: Object.keys(syncedConfig),
        });
      }
    }

    if (await this.exists(newID)) {
      throw new Error(`Workspace id already exists: ${newID}`);
    }

    const newWorkspace: IWorkspace = {
      ...wikiWorkspaceDefaultValues,
      ...workspaceConfig, // Apply config from UI/form first
      ...existingConfig, // Then override with synced config (user's saved settings take priority)
      homeUrl: getDefaultTidGiUrl(newID),
      id: newID,
      lastUrl: null,
      lastNodeJSArgv: [],
      order: typeof workspaceConfig.order === 'number' ? workspaceConfig.order : await this.getNextInsertOrder(),
      picturePath: null,
      useTidgiConfigSync: isHtmlConfig ? false : (useTidgiConfig ?? true),
      ...(isHtmlConfig && normalizedHtmlPaths
        ? {
          workspaceType: WorkspaceType.html,
          htmlFileLocation: normalizedHtmlPaths.htmlFileLocation,
          wikiFolderLocation: normalizedHtmlPaths.wikiFolderLocation,
          isSubWiki: false,
          mainWikiID: null,
          tagNames: [],
          includeTagTree: false,
          fileSystemPathFilterEnable: false,
          fileSystemPathFilter: null,
        }
        : {}),
    };

    await this.set(newID, newWorkspace, true);
    logger.info(`[test-id-WORKSPACE_CREATED] Workspace created`, {
      workspaceId: newID,
      workspaceName: newWorkspace.name,
      wikiFolderLocation: newWorkspace.wikiFolderLocation,
      workspaceType: isWikiWorkspace(newWorkspace) ? newWorkspace.workspaceType : undefined,
      htmlFileLocation: isHtmlWikiWorkspace(newWorkspace) ? newWorkspace.htmlFileLocation : undefined,
    });

    // Track workspace creation event
    const analyticsService = container.get<IAnalyticsService>(serviceIdentifier.Analytics);
    void analyticsService.track('workspace.created', {
      isSubWiki: newWorkspace.isSubWiki ?? false,
      hasGitUrl: Boolean(newWorkspace.gitUrl),
    });

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
      // Always call setActiveWorkspaceView, even when clicking the already-active workspace.
      // When the window is restored from background the WebContentsView may be blank;
      // calling setActiveWorkspaceView forces showView() → remove+add+focus which triggers
      // a proper compositor repaint.  When switching to a different workspace the logic is
      // unchanged.  setActiveWorkspaceView is safe to call with the same ID (skips hibernation).
      await workspaceViewService.setActiveWorkspaceView(idToActive);
      if (title) {
        await wikiService.wikiOperationInBrowser(WikiChannel.openTiddler, idToActive, [title]);
      }
      return;
    }
    // If is sub wiki, open the main wiki first and open the tag or provided title
    if (isSubWiki && mainWikiID) {
      const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);
      const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
      // Same reasoning as above — always call even if already active.
      await workspaceViewService.setActiveWorkspaceView(mainWikiID);
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

  /**
   * Get workspace token for Git Smart HTTP authentication
   */
  public async getWorkspaceToken(workspaceId: string): Promise<string | undefined> {
    const workspace = this.getSync(workspaceId);
    if (!workspace || !isWikiWorkspace(workspace) || !workspace.tokenAuth) {
      return undefined;
    }
    return workspace.authToken;
  }

  /**
   * Validate workspace token for Git Smart HTTP authentication
   */
  public async validateWorkspaceToken(workspaceId: string, token: string): Promise<boolean> {
    const workspaceToken = await this.getWorkspaceToken(workspaceId);
    if (!workspaceToken) {
      return false;
    }
    return workspaceToken === token;
  }

  // Workspace group methods
  private groups: Record<string, IWorkspaceGroup> | undefined;
  public groups$ = new BehaviorSubject<Record<string, IWorkspaceGroup> | undefined>(undefined);
  private previousGroups: Record<string, IWorkspaceGroup> | undefined;

  private emitGroups(next: Record<string, IWorkspaceGroup> | undefined): void {
    // Skip emission when nothing actually changed to break infinite render loops.
    if (this.previousGroups !== undefined && next !== undefined && isEqual(this.previousGroups, next)) {
      return;
    }
    this.previousGroups = next;
    this.groups$.next(next);
  }

  private getGroupsSync(): Record<string, IWorkspaceGroup> {
    if (this.groups === undefined) {
      const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
      const groupsFromDisk = databaseService.getSetting('workspaceGroups') ?? {};
      if (typeof groupsFromDisk === 'object' && !Array.isArray(groupsFromDisk)) {
        this.groups = groupsFromDisk;
      } else {
        this.groups = {};
      }
      // Initialize the observable with current groups
      this.emitGroups(this.groups);
    }
    return this.groups;
  }

  public async getGroups(): Promise<Record<string, IWorkspaceGroup>> {
    return this.getGroupsSync();
  }

  public async getGroupsAsList(): Promise<IWorkspaceGroup[]> {
    const groups = this.getGroupsSync();
    return Object.values(groups).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  public async getGroup(id: string): Promise<IWorkspaceGroup | undefined> {
    const groups = this.getGroupsSync();
    return groups[id];
  }

  public async setGroup(id: string, group: IWorkspaceGroup): Promise<void> {
    const groups = this.getGroupsSync();
    const isNew = !groups[id];
    const nextGroups = { ...groups, [id]: group };
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    databaseService.setSetting('workspaceGroups', nextGroups);
    this.groups = nextGroups;
    this.emitGroups(nextGroups);
    if (isNew) {
      const analyticsService = container.get<IAnalyticsService>(serviceIdentifier.Analytics);
      void analyticsService.track('workspace.group.created', { groupCount: Object.keys(nextGroups).length });
    }
  }

  public async removeGroup(id: string): Promise<void> {
    const groups = this.getGroupsSync();
    const { [id]: _, ...nextGroups } = groups;
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    databaseService.setSetting('workspaceGroups', nextGroups);
    this.groups = nextGroups;
    this.emitGroups(nextGroups);

    const analyticsService = container.get<IAnalyticsService>(serviceIdentifier.Analytics);
    void analyticsService.track('workspace.group.deleted', { groupCount: Object.keys(nextGroups).length });

    // Move workspaces in this group to ungrouped
    const workspaces = this.getWorkspacesSync();
    const workspacesToUpdate: Record<string, IWorkspace> = {};
    for (const [workspaceId, workspace] of Object.entries(workspaces)) {
      if (workspace.groupId === id) {
        workspacesToUpdate[workspaceId] = { ...workspace, groupId: null };
      }
    }
    if (Object.keys(workspacesToUpdate).length > 0) {
      await this.setWorkspaces(workspacesToUpdate);
    }
  }

  public async moveWorkspaceToGroup(workspaceId: string, groupId: string | null, autoDisband = true): Promise<void> {
    const workspace = await this.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const oldGroupId = workspace.groupId;
    await this.update(workspaceId, { groupId });

    const groups = this.getGroupsSync();
    const groupCount = Object.keys(groups).length;
    const analyticsService = container.get<IAnalyticsService>(serviceIdentifier.Analytics);
    if (groupId) {
      void analyticsService.track('workspace.moved_to_group', { groupId, groupCount });
    } else {
      void analyticsService.track('workspace.moved_out_of_group', { groupCount });
    }

    // Auto-disband old group only when explicitly allowed (e.g. drag operations).
    // Right-click or settings removal should not trigger auto-disband,
    // matching the requirement that only dragging out the last workspace truly cancels a group.
    if (autoDisband && oldGroupId) {
      await this.disbandGroupIfEmpty(oldGroupId);
    }
  }

  /**
   * Disband group if it has zero workspaces left.
   * Groups are only removed when they become completely empty,
   * not when dropping from 2→1 workspaces.
   */
  private async disbandGroupIfEmpty(groupId: string): Promise<void> {
    const workspaces = this.getWorkspacesSync();
    const workspacesInGroup = Object.values(workspaces).filter(w => w.groupId === groupId);

    if (workspacesInGroup.length === 0) {
      await this.removeGroup(groupId);
    }
  }
}
