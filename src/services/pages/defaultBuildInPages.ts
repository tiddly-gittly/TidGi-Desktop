import { IPage, PageType } from './interface';

/**
 * Add React component route for build-in pages in `src/pages/Main/index.tsx`
 */
export const defaultBuildInPages: Record<string, IPage> = {
  workflow: {
    type: PageType.workflow,
    id: PageType.workflow,
    active: false,
    hide: false,
    order: 0,
  },
  guide: {
    type: PageType.guide,
    id: PageType.guide,
    active: false,
    hide: false,
    order: 0,
  },
};
