import type { ITiddlyWiki } from 'tiddlywiki';
import { describe, expect, it, vi } from 'vitest';

import { applyInitialPaletteBeforeIndexRender } from '../applyInitialPalette';

interface IMockTiddlerFields {
  text?: string;
  title?: string;
  type?: string;
}

function createMockWikiInstance(options?: {
  defaultDarkPalette?: string;
  defaultLightPalette?: string;
  detectionEnabled?: string;
  existingPalette?: IMockTiddlerFields;
}): {
  addTiddler: ReturnType<typeof vi.fn>;
  wikiInstance: ITiddlyWiki;
} {
  const addTiddler = vi.fn();
  const getTiddler = vi.fn((title: string) => {
    if (title === '$:/palette') {
      return options?.existingPalette;
    }
    return undefined;
  });
  const getTiddlerText = vi.fn((title: string, defaultValue: string) => {
    switch (title) {
      case '$:/config/palette/enable-light-dark-detection':
        return options?.detectionEnabled ?? 'yes';
      case '$:/config/palette/default-dark':
        return options?.defaultDarkPalette ?? '$:/palettes/GruvboxDark';
      case '$:/config/palette/default-light':
        return options?.defaultLightPalette ?? '$:/palettes/Vanilla';
      default:
        return defaultValue;
    }
  });

  function MockTiddler(existingFields?: IMockTiddlerFields, newFields?: IMockTiddlerFields) {
    return { ...(existingFields ?? {}), ...(newFields ?? {}) };
  }

  const wikiInstance = {
    Tiddler: MockTiddler,
    wiki: {
      addTiddler,
      getTiddler,
      getTiddlerText,
    },
  } as unknown as ITiddlyWiki;

  return { addTiddler, wikiInstance };
}

describe('applyInitialPaletteBeforeIndexRender', () => {
  it('stores the configured dark palette title in $:/palette', () => {
    const { addTiddler, wikiInstance } = createMockWikiInstance({
      existingPalette: {
        title: '$:/palette',
        text: '$:/palettes/OldLight',
        type: 'text/vnd.tiddlywiki',
      },
    });

    applyInitialPaletteBeforeIndexRender(wikiInstance, true);

    expect(addTiddler).toHaveBeenCalledTimes(1);
    expect(addTiddler).toHaveBeenCalledWith({
      title: '$:/palette',
      text: '$:/palettes/GruvboxDark',
      type: 'text/vnd.tiddlywiki',
    });
  });

  it('does nothing when automatic light/dark detection is disabled', () => {
    const { addTiddler, wikiInstance } = createMockWikiInstance({ detectionEnabled: 'no' });

    applyInitialPaletteBeforeIndexRender(wikiInstance, true);

    expect(addTiddler).not.toHaveBeenCalled();
  });

  it('skips updates when the configured palette title is missing', () => {
    const { addTiddler, wikiInstance } = createMockWikiInstance({ defaultLightPalette: '' });

    applyInitialPaletteBeforeIndexRender(wikiInstance, false);

    expect(addTiddler).not.toHaveBeenCalled();
  });
});
