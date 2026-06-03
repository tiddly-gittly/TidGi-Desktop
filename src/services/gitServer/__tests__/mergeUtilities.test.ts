import { describe, expect, it } from 'vitest';

import { resolveConflictPreferMobile, resolveTidConflictMarkers } from '@services/gitServer/mergeUtilities';
import type { TidConflictOptions } from '@services/gitServer/mergeUtilities';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Join lines with LF (test expectations use LF). */
function lines(...parts: string[]): string {
  return parts.join('\n');
}

/** Join lines with CRLF (for Windows line-ending tests). */
function crlf(...parts: string[]): string {
  return parts.join('\r\n');
}

// ---------------------------------------------------------------------------
// resolveTidConflictMarkers
// ---------------------------------------------------------------------------

describe('resolveTidConflictMarkers', () => {
  // --- Modify/modify: header+body combined conflict ---

  it('modify/modify combined header+body conflict keeps mobile metadata and both body lines', () => {
    const content = lines(
      'created: 20250226090000000',
      '<<<<<<< HEAD',
      'modified: 20250226100500000',
      'title: Journal',
      'tags: Original',
      '',
      'Line one from original.',
      'Line two from original.',
      'Desktop added this line.',
      '=======',
      'modified: 20250226110000000',
      'title: Journal',
      'tags: Original',
      '',
      'Line one from original.',
      'Line two from original.',
      'Mobile added this line.',
      '>>>>>>> mobile-incoming',
    );

    const result = resolveTidConflictMarkers(content, { mergeHeaderBodyConflicts: true });

    expect(result).toBe(lines(
      'created: 20250226090000000',
      'modified: 20250226110000000',
      'title: Journal',
      'tags: Original',
      '',
      'Line one from original.',
      'Line two from original.',
      'Desktop added this line.',
      'Mobile added this line.',
    ));
  });

  // --- Add/add: same-name conflict keeps mobile/theirs (default option) ---

  it('add/add same-name conflict keeps mobile/theirs when option is false/default', () => {
    const content = lines(
      '<<<<<<< HEAD',
      'created: 20250226100000000',
      'modified: 20250226100500000',
      'title: SharedNote',
      'tags: Desktop',
      '',
      'Written on desktop.',
      '=======',
      'created: 20250226100000000',
      'modified: 20250226110000000',
      'title: SharedNote',
      'tags: Mobile',
      '',
      'Written on mobile.',
      '>>>>>>> mobile-incoming',
    );

    // default: mergeHeaderBodyConflicts = false
    const resultDefault = resolveTidConflictMarkers(content);
    expect(resultDefault).toBe(lines(
      'created: 20250226100000000',
      'modified: 20250226110000000',
      'title: SharedNote',
      'tags: Mobile',
      '',
      'Written on mobile.',
    ));

    // explicit false: same behaviour
    const resultExplicit = resolveTidConflictMarkers(content, { mergeHeaderBodyConflicts: false });
    expect(resultExplicit).toBe(resultDefault);
  });

  // --- CRLF input ---

  it('CRLF input works and strips conflict markers', () => {
    const content = crlf(
      'created: 20250226090000000',
      '<<<<<<< HEAD',
      'modified: 20250226100500000',
      'title: Journal',
      'tags: Original',
      '',
      'Desktop added this line.',
      '=======',
      'modified: 20250226110000000',
      'title: Journal',
      'tags: Original',
      '',
      'Mobile added this line.',
      '>>>>>>> mobile-incoming',
    );

    const result = resolveTidConflictMarkers(content, { mergeHeaderBodyConflicts: true });

    // Output is always LF
    expect(result).not.toContain('\r');
    expect(result).toBe(lines(
      'created: 20250226090000000',
      'modified: 20250226110000000',
      'title: Journal',
      'tags: Original',
      '',
      'Desktop added this line.',
      'Mobile added this line.',
    ));
  });

  // --- Body-only conflict (existing behaviour preserved) ---

  it('body-only conflict merges ours plus unique theirs lines', () => {
    const content = lines(
      'created: 20250226090000000',
      'modified: 20250226090000000',
      'title: Doc',
      '',
      'Shared context line.',
      '<<<<<<< HEAD',
      'Desktop body addition.',
      '=======',
      'Mobile body addition.',
      '>>>>>>> mobile-incoming',
    );

    const result = resolveTidConflictMarkers(content, { mergeHeaderBodyConflicts: true });

    expect(result).toBe(lines(
      'created: 20250226090000000',
      'modified: 20250226090000000',
      'title: Doc',
      '',
      'Shared context line.',
      'Desktop body addition.',
      'Mobile body addition.',
    ));
  });

  // --- Header-only conflict (no body crossing) ---

  it('header-only conflict keeps theirs even with mergeHeaderBodyConflicts true', () => {
    const content = lines(
      '<<<<<<< HEAD',
      'modified: 20250226100500000',
      '=======',
      'modified: 20250226110000000',
      '>>>>>>> mobile-incoming',
      'title: Note',
      'tags: Shared',
      '',
      'Body content.',
    );

    const withOption: TidConflictOptions = { mergeHeaderBodyConflicts: true };
    const withoutOption: TidConflictOptions = { mergeHeaderBodyConflicts: false };

    const resultWith = resolveTidConflictMarkers(content, withOption);
    const resultWithout = resolveTidConflictMarkers(content, withoutOption);

    // Both should prefer theirs (mobile metadata wins)
    const expected = lines(
      'modified: 20250226110000000',
      'title: Note',
      'tags: Shared',
      '',
      'Body content.',
    );

    expect(resultWith).toBe(expected);
    expect(resultWithout).toBe(expected);
  });

  // --- Modify/modify with partial body overlap ---

  it('header+body conflict with mergeHeaderBodyConflicts skips duplicate body lines', () => {
    // ours and theirs share some body lines; only unique theirs should be added
    const content = lines(
      '<<<<<<< HEAD',
      'modified: 20250226100500000',
      'title: Doc',
      '',
      'Shared line.',
      'Desktop unique.',
      '=======',
      'modified: 20250226110000000',
      'title: Doc',
      '',
      'Shared line.',
      'Mobile unique.',
      '>>>>>>> mobile-incoming',
    );

    const result = resolveTidConflictMarkers(content, { mergeHeaderBodyConflicts: true });

    expect(result).toBe(lines(
      'modified: 20250226110000000',
      'title: Doc',
      '',
      'Shared line.',
      'Desktop unique.',
      'Mobile unique.',
    ));
  });

  // --- Multiple conflict blocks ---

  it('handles multiple conflict blocks in one file', () => {
    const content = lines(
      'created: 20250226090000000',
      '<<<<<<< HEAD',
      'modified: 20240226100500000',
      '=======',
      'modified: 20250226110000000',
      '>>>>>>> mobile-incoming',
      'title: MultiBlock',
      '',
      'Line A.',
      '<<<<<<< HEAD',
      'Desktop edit.',
      '=======',
      'Mobile edit.',
      '>>>>>>> mobile-incoming',
    );

    const result = resolveTidConflictMarkers(content, { mergeHeaderBodyConflicts: true });

    // First conflict: header-only → theirs wins
    // Second conflict: body → merge ours + unique theirs
    expect(result).toBe(lines(
      'created: 20250226090000000',
      'modified: 20250226110000000',
      'title: MultiBlock',
      '',
      'Line A.',
      'Desktop edit.',
      'Mobile edit.',
    ));
  });

  // --- Empty file / no conflicts ---

  it('returns empty string for empty input', () => {
    expect(resolveTidConflictMarkers('')).toBe('');
    expect(resolveTidConflictMarkers('', { mergeHeaderBodyConflicts: true })).toBe('');
  });

  it('returns unchanged content when no conflict markers present', () => {
    const content = lines('title: SimpleNote', '', 'Just a note.');
    expect(resolveTidConflictMarkers(content, { mergeHeaderBodyConflicts: true })).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// resolveConflictPreferMobile
// ---------------------------------------------------------------------------

describe('resolveConflictPreferMobile', () => {
  it('keeps theirs (mobile) lines for all conflict sections', () => {
    const content = lines(
      '<<<<<<< HEAD',
      'ours content',
      '=======',
      'theirs content',
      '>>>>>>> mobile-incoming',
      '<outside></outside>',
    );

    const result = resolveConflictPreferMobile(content);
    expect(result).toBe(lines('theirs content', '<outside></outside>'));
  });

  it('normalises CRLF input', () => {
    const content = crlf(
      '<<<<<<< HEAD',
      'desktop',
      '=======',
      'mobile',
      '>>>>>>> mobile-incoming',
    );

    const result = resolveConflictPreferMobile(content);
    expect(result).not.toContain('\r');
    expect(result).toBe('mobile');
  });

  it('handles multiple conflict blocks', () => {
    const content = lines(
      '<<<<<<< HEAD',
      'd1',
      '=======',
      'm1',
      '>>>>>>> mobile-incoming',
      '---',
      '<<<<<<< HEAD',
      'd2',
      '=======',
      'm2',
      '>>>>>>> mobile-incoming',
    );

    expect(resolveConflictPreferMobile(content)).toBe(lines('m1', '---', 'm2'));
  });
});
