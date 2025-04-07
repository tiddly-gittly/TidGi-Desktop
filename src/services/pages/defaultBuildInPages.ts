import { IPage, PageType } from './interface';

/**
 * Add React component route for build-in pages in `src/pages/Main/index.tsx`
 */
export const defaultBuildInPages: Record<string, IPage> = {
  agent: {
    type: PageType.agent,
    id: PageType.agent,
    active: false,
    hide: false,
    order: 1,
  },
  help: {
    type: PageType.help,
    id: PageType.help,
    active: false,
    hide: false,
    order: 2,
  },
  guide: {
    type: PageType.guide,
    id: PageType.guide,
    active: false,
    hide: false,
    order: 3,
  },
};
