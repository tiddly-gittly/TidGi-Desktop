import { IPage, PageType } from './interface';

/**
 * Add React component route for build-in pages in `src/pages/Main/index.tsx`
 */
export const defaultBuildInPages: Record<string, IPage> = {
  help: {
    type: PageType.help,
    id: PageType.help,
    active: false,
    hide: false,
    order: 1,
  },
  guide: {
    type: PageType.guide,
    id: PageType.guide,
    active: false,
    hide: false,
    order: 2,
  },
};
