import { PagesChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { BehaviorSubject } from 'rxjs';

export enum PageType {
  /**
   * Default empty page, have some user guide and new user settings.
   */
  guide = 'guide',
  /**
   * All "workspaces". It is hard to merge workspace concept with page concept, because will need to migrate all user data. So we leave them to be still workspace, but also call them wiki pages. And in event listeners about wiki page, we redirect them to call workspace methods.
   */
  wiki = 'wiki',
  /**
   * AI workflow
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
 * Handle switch between wiki and build-in pages like Workflow page.
 */
export interface IPagesService {
  clearActivePage(id: string | PageType | undefined): Promise<void>;
  get(id: string): Promise<IPage | undefined>;
  getActivePage(): Promise<IPage | undefined>;
  getActivePageSync(): IPage | undefined;
  getPagesAsList(): Promise<IPage[]>;
  getPagesAsListSync(): IPage[];
  getSync(id: string): IPage;
  pages$: BehaviorSubject<IPage[]>;
  set(id: string, page: IPage): Promise<void>;
  setActivePage(id: string | PageType, oldActivePageID: string | PageType | undefined): Promise<void>;
  setPages(newPages: Record<string, IPage>): Promise<void>;
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
  },
};
