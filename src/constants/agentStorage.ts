export const PERSISTED_MESSAGE_LIST_PROJECTION_BYTES = 48 * 1024;

export const TIMELINE_RANK_CHECKPOINT_INTERVAL = 256;

export const MAX_CANONICAL_JSON_DEPTH = 32;

export const MAX_CANONICAL_JSON_NODES = 200_000;

export const MAX_EVENT_PAGE_SIZE = 80;

export const MAX_EVENT_RANGES = 256;

export const TIMELINE_STORED_PREVIEW_LENGTH = 240;

export const TIMELINE_ACTOR_LENGTH = 160;

export const LARGE_REMOTE_PROJECTION_BATCH = 256;

/** Seven detail columns per row keep each insert within SQLite's parameter limit. */
export const REMOTE_PROJECTION_CHUNK_SIZE = 1_000;
