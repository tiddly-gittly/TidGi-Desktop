/**
 * Slugify a string to make it safe for filesystem use
 *
 * This function is used across the codebase to ensure consistent slug generation:
 * - In appPaths.ts for test scenario isolation
 * - In paths.ts for wiki folder paths
 * - In E2E tests for artifact directory names
 *
 * Rules:
 * - Allow Unicode letters/numbers (\p{L}\p{N}) and spaces, hyphen, underscore and parentheses
 * - Remove dots completely (to avoid trailing-dot issues on Windows)
 * - Replace any other char with '-' (this includes brackets, quotes, punctuation)
 * - Collapse multiple '-' into one, collapse multiple spaces into one, trim, and limit length
 *
 * @param input - The string to slugify
 * @param maxLength - Maximum length of the resulting slug (default: 60 for most use cases, 120 for E2E artifacts)
 * @returns A safe, filesystem-friendly slug
 */
export function slugify(input: string | undefined, maxLength: number = 60): string {
  if (!input) return 'unknown';

  // Normalize unicode characters
  let s = input.normalize('NFKC');

  // Remove dots explicitly
  s = s.replace(/\./g, '');

  // Replace unsafe characters with dashes
  let slug = s.replace(/[^\p{L}\p{N}\s\-_()]/gu, '-');

  // Collapse consecutive dashes
  slug = slug.replace(/-+/g, '-');

  // Collapse spaces to single space, trim edges
  slug = slug.replace(/\s+/g, ' ').trim();

  // Trim leading/trailing dashes or spaces
  slug = slug.replace(/^-+|-+$/g, '').replace(/^[\s]+|[\s]+$/g, '');

  // Limit length and trim
  if (slug.length > maxLength) {
    slug = slug.substring(0, maxLength).trim();
  }

  // Final cleanup: remove trailing dashes/spaces that may appear after truncation
  slug = slug.replace(/[-\s]+$/g, '');

  return slug || 'unknown';
}
