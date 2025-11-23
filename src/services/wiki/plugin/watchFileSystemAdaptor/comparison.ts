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
  const oldKeys = new Set(Object.keys(oldTiddler)).difference(EXCLUDED_FIELDS);
  const newKeys = new Set(Object.keys(newTiddler)).difference(EXCLUDED_FIELDS);

  // Quick check: Different number of fields
  if (oldKeys.size !== newKeys.size) {
    return true;
  }

  // Check if there are any different keys (fields added or removed)
  if (oldKeys.difference(newKeys).size > 0) {
    return true;
  }

  // Deep comparison: Check each field value (keys are the same at this point)
  for (const key of oldKeys) {
    if (oldTiddler[key] !== newTiddler[key]) {
      return true; // Field value changed
    }
  }

  return false; // No meaningful changes
}
