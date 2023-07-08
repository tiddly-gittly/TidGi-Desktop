/* eslint-disable @typescript-eslint/require-await */
import settings from 'electron-settings';
import { injectable } from 'inversify';
import { debounce, pickBy } from 'lodash';

import { lazyInject } from '@services/container';
import { logger } from '@services/libs/log';
import { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWindowService } from '@services/windows/interface';
import { IWorkspaceService } from '@services/workspaces/interface';
import { BehaviorSubject } from 'rxjs';
import { debouncedSetSettingFile } from './debouncedSetSettingFile';
import { defaultBuildInPages } from './defaultBuildInPages';
import { IPage, IPagesService, PageType } from './interface';

@injectable()
export class Pages implements IPagesService {
  /**
   * Record from page id/PageType to page settings. For build-in pages, id is the type.
   */
  private readonly pages: Record<string, IPage> = {};

  public pages$: BehaviorSubject<IPage[]>;

  @lazyInject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  @lazyInject(serviceIdentifier.Window)
  private readonly windowService!: IWindowService;

  @lazyInject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

  constructor() {
    this.pages = this.getInitPagesForCache();
    this.pages$ = new BehaviorSubject<IPage[]>(this.getPagesAsListSync());
    this.updatePageSubject = debounce(this.updatePageSubject.bind(this), 500) as () => Promise<void>;
  }

  private async updatePageSubject(): Promise<void> {
    this.pages$.next(this.getPagesAsListSync());
  }

  /**
   * load pages in sync, and ensure it is an Object
   */
  private getInitPagesForCache(): Record<string, IPage> {
    const pagesFromDisk = settings.getSync(`pages`) ?? defaultBuildInPages;
    const loadedPages = typeof pagesFromDisk === 'object' && !Array.isArray(pagesFromDisk)
      ? pickBy(pagesFromDisk, (value) => value !== null) as unknown as Record<string, IPage>
      : {};
    return loadedPages;
  }

  public async setActivePage(id: string | PageType, oldActivePageID: string | PageType | undefined): Promise<void> {
    logger.info(`openPage: ${id}`);
    await this.update(id, { active: true });
    if (oldActivePageID !== id) {
      await this.clearActivePage(oldActivePageID);
    }
    // switch from workspace to page , clear active workspace to close its browser view
    const activeWorkspace = this.workspaceService.getActiveWorkspaceSync();
    await this.workspaceService.clearActiveWorkspace(activeWorkspace?.id);
  }

  public async clearActivePage(id: string | PageType | undefined): Promise<void> {
    if (id === undefined) {
      return;
    }
    await this.update(id, { active: false });
  }

  public async getActivePage(): Promise<IPage | undefined> {
    return this.getActivePageSync();
  }

  public getActivePageSync(): IPage | undefined {
    return this.getPagesAsListSync().find((page) => page.active);
  }

  public async set(id: string | PageType, page: IPage): Promise<void> {
    this.pages[id] = page;
    void debouncedSetSettingFile(this.pages);
    void this.updatePageSubject();
  }

  public async update(id: string | PageType, pageSetting: Partial<IPage>): Promise<void> {
    const page = this.getSync(id);
    if (page === undefined) {
      logger.error(`Could not update page ${id} because it does not exist`);
      return;
    }
    await this.set(id, { ...page, ...pageSetting });
  }

  public async get(id: string | PageType): Promise<IPage | undefined> {
    return this.getSync(id);
  }

  public getSync(id: string | PageType): IPage {
    return this.pages[id];
  }

  /**
   * Get sorted page list
   * Async so proxy type is async
   */
  public async getPagesAsList(): Promise<IPage[]> {
    return Object.values(this.pages);
  }

  public async setPages(newPages: Record<string, IPage>): Promise<void> {
    for (const id in newPages) {
      await this.set(id, newPages[id]);
    }
  }

  /**
   * Get sorted page list
   * Sync for internal use
   */
  public getPagesAsListSync(): IPage[] {
    return Object.values(this.pages);
  }
}
