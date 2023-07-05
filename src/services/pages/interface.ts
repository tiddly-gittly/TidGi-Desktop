import { PagesChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { BehaviorSubject } from 'rxjs';

export enum PageType {
  wiki = 'wiki',
  workflow = 'workflow',
}
export interface IPage {
  active: boolean;
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
  openPage(page: PageType): Promise<void>;
  pages$: BehaviorSubject<IPage[]>;
}
export const PagesServiceIPCDescriptor = {
  channel: PagesChannel.name,
  properties: {
    openPage: ProxyPropertyType.Function,
    pages$: ProxyPropertyType.Value$,
  },
};
