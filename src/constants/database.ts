/**
 * Meme Loop conversations are intentionally stored under a new database key.
 * The legacy Agent cache is disposable and must never be opened by the current
 * runtime, but Preferences can still remove it during cleanup.
 */
export const MEME_LOOP_DATABASE_KEY = 'meme-loop';
export const LEGACY_AGENT_DATABASE_KEY = 'agent';
