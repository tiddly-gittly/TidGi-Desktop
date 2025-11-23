/**
 * High-performance tiddler comparison utilities
 * Used to detect if a tiddler has actually changed to prevent unnecessary saves
 */

/**
 * Fields that change automatically during save and should be excluded from comparison
 */
const EXCLUDED_FIELDS = new Set([
  'modified', // Always updated on save
  'revision', // Internal TiddlyWiki revision counter
  'bag', // TiddlyWeb specific
  'created', // May be auto-generated
]);

/**
 * Fast comparison of two tiddlers to detect real content changes
 * Strategy:
 * 1. Quick length check on text field (most common change)
 * 2. Compare field counts
 * 3. Deep compare only if needed
 *
 * @param oldTiddler - Existing tiddler in wiki
 * @param newTiddler - New tiddler from file
 * @returns true if tiddlers are meaningfully different
 */
export function hasMeaningfulChanges(
  oldTiddler: Record<string, unknown>,
  newTiddler: Record<string, unknown>,
): boolean {
  // Fast path: Compare text field length first (most common change)
  const oldText = oldTiddler.text as string | undefined;
  const newText = newTiddler.text as string | undefined;

  if ((oldText?.length ?? 0) !== (newText?.length ?? 0)) {
    return true; // Text length changed - definitely different
  }

  // Get field keys excluding auto-generated ones
  const oldKeys = Object.keys(oldTiddler).filter(key => !EXCLUDED_FIELDS.has(key));
  const newKeys = Object.keys(newTiddler).filter(key => !EXCLUDED_FIELDS.has(key));

  // Quick check: Different number of fields
  if (oldKeys.length !== newKeys.length) {
    return true;
  }

  // Deep comparison: Check each field value
  for (const key of oldKeys) {
    if (!Object.hasOwn(newTiddler, key)) {
      return true; // Field removed
    }
    if (oldTiddler[key] !== newTiddler[key]) {
      return true; // Field value changed
    }
  }

  // Check for new fields
  for (const key of newKeys) {
    if (!Object.hasOwn(oldTiddler, key)) {
      return true; // New field added
    }
  }

  return false; // No meaningful changes
}
