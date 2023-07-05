/* eslint-disable @typescript-eslint/require-await */
import settings from 'electron-settings';
import { injectable } from 'inversify';

import { lazyInject } from '@services/container';
import { logger } from '@services/libs/log';
import { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWindowService } from '@services/windows/interface';
import { IWorkspaceService } from '@services/workspaces/interface';
import { pickBy } from 'lodash';
import { BehaviorSubject } from 'rxjs';
import { debouncedSetSettingFile } from './debouncedSetSettingFile';
import { defaultBuildInPages } from './defaultBuildInPages';
import { IPage, IPagesService, PageType } from './interface';

@injectable()
export class Pages implements IPagesService {
  /**
   * Record from page id to page settings
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
  }

  private async updatePageSubject(): Promise<void> {
    this.pages$.next(this.getPagesAsListSync());
  }

  /**
   * load pages in sync, and ensure it is an Object
   */
  private getInitPagesForCache(): Record<string, IPage> {
    // DEBUG: console settings.getSync(`pages`)
    console.log(`settings.getSync(pages)`, settings.getSync(`pages`));
    const pagesFromDisk = settings.getSync(`pages`) ?? defaultBuildInPages;
    const loadedPages = typeof pagesFromDisk === 'object' && !Array.isArray(pagesFromDisk)
      ? pickBy(pagesFromDisk, (value) => value !== null) as unknown as Record<string, IPage>
      : {};
    return loadedPages;
  }

  public async openPage(page: PageType): Promise<void> {
    logger.info(`openPage: ${page}`);
  }

  public async set(id: string, page: IPage): Promise<void> {
    this.pages[id] = page;
    void debouncedSetSettingFile(this.pages);
  }

  public async get(id: string): Promise<IPage | undefined> {
    return this.getSync(id);
  }

  private getSync(id: string): IPage {
    return this.pages[id];
  }

  /**
   * Get sorted page list
   * Async so proxy type is async
   */
  public async getPagesAsList(): Promise<IPage[]> {
    return Object.values(this.pages);
  }

  /**
   * Get sorted page list
   * Sync for internal use
   */
  private getPagesAsListSync(): IPage[] {
    return Object.values(this.pages);
  }
}
