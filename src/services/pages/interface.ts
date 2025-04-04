import { PagesChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { BehaviorSubject } from 'rxjs';

export enum PageType {
  /**
   * Default empty page, have some user guide and new user settings.
   */
  guide = 'guide',
  /**
   * Show list of available help resources to learn TiddlyWiki.
   */
  help = 'help',
  /**
   * All "workspaces". It is hard to merge workspace concept with page concept, because will need to migrate all user data. So we leave them to be still workspace, but also call them wiki pages. And in event listeners about wiki page, we redirect them to call workspace methods.
   */
  wiki = 'wiki',
  /**
   * Workflow page for AI agents.
   */
  workflow = 'workflow',
}
export interface IPage {
  active: boolean;
  /**
   * User can hide a page's button from sidebar if they don't want to see it.
   */
  hide: boolean;
  /**
   * Wiki's workspaceID, or just be build-in page's type.
   */
  id: string;
  order: number;
  type: PageType;
}

/**
 * Handle switch between wiki and build-in pages like guide page.
 */
export interface IPagesService {
  clearActivePage(id: string | PageType | undefined): Promise<void>;
  get(id: string): Promise<IPage | undefined>;
  getActivePage(): Promise<IPage | undefined>;
  getActivePageSync(): IPage | undefined;
  getPagesAsList(): Promise<IPage[]>;
  getPagesAsListSync(): IPage[];
  getSync(id: string): IPage;
  pages$: BehaviorSubject<IPage[] | undefined>;
  /**
   * Overwrite a page, and update setting file.
   * @param updateSettingFile Default to true. Async update setting file, and let go the promise. So if you want to update multiple pages, don't use this, use `setPages` instead.
   */
  set(id: string, page: IPage, updateSettingFile?: boolean): Promise<void>;
  /**
   * Set active page, deactivate old active page. and update setting file.
   * @param id New active page's id
   */
  setActivePage(id: string | PageType): Promise<void>;
  setPages(newPages: Record<string, IPage>): Promise<void>;
  /**
   * Update a page, merge provided value with existed values, and update setting file.
   * @param updateSettingFile Default to true. Async update setting file, and let go the promise. So if you want to update multiple pages, don't use this, use `setPages` instead.
   */
  update(id: string, page: Partial<IPage>, updateSettingFile?: boolean): Promise<void>;
  /**
   * Manually refresh the observable's content, that will be received by react component.
   */
  updatePageSubject(): void;
  updatePages(newPages: Record<string, Partial<IPage>>): Promise<void>;
}
export const PagesServiceIPCDescriptor = {
  channel: PagesChannel.name,
  properties: {
    get: ProxyPropertyType.Function,
    getActivePage: ProxyPropertyType.Function,
    getPagesAsList: ProxyPropertyType.Function,
    pages$: ProxyPropertyType.Value$,
    set: ProxyPropertyType.Function,
    setActivePage: ProxyPropertyType.Function,
    setPages: ProxyPropertyType.Function,
    update: ProxyPropertyType.Function,
    updatePages: ProxyPropertyType.Function,
    updatePageSubject: ProxyPropertyType.Function,
  },
};
