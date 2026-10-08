/**
 * Meme Loop conversations are intentionally stored under a new database key.
 * The database has no compatibility contract with the abandoned Agent cache.
 * Current installations only create and clear this database.
 */
export const MEME_LOOP_DATABASE_KEY = 'meme-loop';
