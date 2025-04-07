/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
/* eslint-disable @typescript-eslint/require-await */
import { injectable } from 'inversify';
import { mapValues, pickBy } from 'lodash';

import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWorkspaceViewService } from '@services/workspacesView/interface';
import { BehaviorSubject } from 'rxjs';
import { defaultBuildInPages } from './defaultBuildInPages';
import { IPage, IPagesService, PageType } from './interface';

@injectable()
export class Pages implements IPagesService {
  /**
   * Record from page id/PageType to page settings. For build-in pages, id is the type.
   */
  private pages: Record<string | PageType, IPage> | undefined;

  public pages$ = new BehaviorSubject<IPage[] | undefined>(undefined);

  @lazyInject(serviceIdentifier.WorkspaceView)
  private readonly workspaceViewService!: IWorkspaceViewService;

  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  public updatePageSubject(): void {
    this.pages$.next(this.getPagesAsListSync());
  }

  /**
   * load pages in sync, and ensure it is an Object
   */
  private getInitPagesForCache(): Record<string | PageType, IPage> {
    const pagesFromDisk = this.databaseService.getSetting('pages');
    const loadedPages = typeof pagesFromDisk === 'object' && !Array.isArray(pagesFromDisk)
      ? pickBy(pagesFromDisk, (value) => value !== null) as unknown as Record<string | PageType, IPage>
      : {};
    return this.sanitizePageSettings(loadedPages);
  }

  private sanitizePageSettings(pages: Record<string | PageType, IPage>): Record<string | PageType, IPage> {
    // assign newly added default page setting to old user config, if user config missing a key (id of newly added build-in page)
    const firstActivePage = Object.values(pages).find((page) => page.active);
    const sanitizedPages = {
      ...defaultBuildInPages,
      ...mapValues(pages, page => ({
        ...page,
        active: false,
      })),
    };
    if (firstActivePage !== undefined) {
      const pageToActive = sanitizedPages[firstActivePage.id];
      if (pageToActive !== undefined) {
        pageToActive.active = true;
      }
    }
    return sanitizedPages;
  }

  public async setActivePage(id: string | PageType): Promise<void> {
    logger.info(`setActivePage() openPage: ${id}`);
    const oldActivePage = this.getActivePageSync();
    const oldActivePageID = oldActivePage?.id;
    logger.info(`setActivePage() closePage: ${oldActivePageID ?? 'undefined'}`);
    if (oldActivePageID === id) return;
    if (oldActivePageID === undefined || oldActivePageID === PageType.wiki) {
      await this.update(id, { active: true });
    } else {
      if (id === PageType.wiki) {
        // wiki don't have page record here, so we only need to update the old active page (like Help page)
        await this.update(oldActivePageID, { active: false });
      } else {
        await this.updatePages({ [id]: { active: true }, [oldActivePageID]: { active: false } });
      }
    }
    if (id !== PageType.wiki) {
      // delay this so the page state can be updated first
      setTimeout(() => {
        void this.workspaceViewService.clearActiveWorkspaceView();
      }, 0);
    }
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

  public async get(id: string | PageType): Promise<IPage | undefined> {
    return this.getSync(id);
  }

  public getSync(id: string | PageType): IPage {
    return this.getPages()[id];
  }

  public async set(id: string | PageType, page: IPage, updateSettingFile = true): Promise<void> {
    logger.info(`set page ${id} with ${JSON.stringify(page)}`, { updateSettingFile });
    const pages = this.getPages();
    pages[id] = page;
    if (updateSettingFile) {
      this.updatePageSubject();
      this.databaseService.setSetting('pages', pages);
    }
  }

  public async update(id: string | PageType, pageSetting: Partial<IPage>, updateSettingFile = true): Promise<void> {
    const page = this.getSync(id);
    if (page === undefined) {
      logger.error(`Could not update page ${id} because it does not exist`);
      return;
    }
    await this.set(id, { ...page, ...pageSetting }, updateSettingFile);
  }

  public async setPages(newPages: Record<string, IPage>): Promise<void> {
    for (const id in newPages) {
      await this.set(id, newPages[id], false);
    }
    this.updatePageSubject();
    this.databaseService.setSetting('pages', this.getPages());
  }

  public async updatePages(newPages: Record<string, Partial<IPage>>): Promise<void> {
    for (const id in newPages) {
      await this.update(id, newPages[id], false);
    }
    this.updatePageSubject();
    this.databaseService.setSetting('pages', this.getPages());
  }

  /**
   * Get sorted page list
   * Async so proxy type is async
   */
  public async getPagesAsList(): Promise<IPage[]> {
    return this.getPagesAsListSync();
  }

  /**
   * Get sorted page list
   * Sync for internal use
   */
  public getPagesAsListSync(): IPage[] {
    return Object.values(this.getPages());
  }

  private getPages(): Record<string | PageType, IPage> {
    if (this.pages === undefined) {
      this.pages = this.getInitPagesForCache();
    }
    return this.pages;
  }
}
