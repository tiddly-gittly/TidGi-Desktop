export enum WikiStateKey {
  sidebar = 'sidebar',
  sideBarOpened = 'sideBarOpened',
  titleBarOpened = 'titleBarOpened',
}

export const WIKI_SAVE_TIMEOUT_MS = 30_000;
export const WORKER_AVAILABILITY_TIMEOUT_MS = 10_000;
export const DEFAULT_WIKI_SCAN_MAX_DEPTH = 32;
export const DEFAULT_WIKI_SCAN_MAX_FILES = 50_000;
export const WORKSPACE_STARTUP_CONCURRENCY = 3;

export const WIKI_WORKER_LIFECYCLE_MESSAGE_TYPE = 'tidgi-wiki-worker-lifecycle';
