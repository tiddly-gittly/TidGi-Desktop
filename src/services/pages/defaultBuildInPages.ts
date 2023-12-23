import { IPage, PageType } from './interface';

/**
 * Add React component route for build-in pages in `src/pages/Main/index.tsx`
 */
export const defaultBuildInPages: Record<string, IPage> = {
  guide: {
    type: PageType.guide,
    id: PageType.guide,
    active: false,
    hide: false,
    order: 0,
  },
};
