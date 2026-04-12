import type { ITiddlyWiki } from 'tiddlywiki';

const enableLightDarkDetectionTiddler = '$:/config/palette/enable-light-dark-detection';
const defaultDarkPaletteTiddler = '$:/config/palette/default-dark';
const defaultLightPaletteTiddler = '$:/config/palette/default-light';
const paletteTiddlerTitle = '$:/palette';

/**
 * Keep the worker-side wiki palette aligned before the first tidgi:// index render.
 * The rendered HTML reads from `$:/palette`, so this must store the palette title,
 * not the palette dictionary body.
 */
export function applyInitialPaletteBeforeIndexRender(
  wikiInstance: ITiddlyWiki,
  shouldUseDarkColors: boolean,
): void {
  const detectionEnabled = wikiInstance.wiki.getTiddlerText(enableLightDarkDetectionTiddler, 'yes');
  if (detectionEnabled !== 'yes') return;

  const defaultPaletteConfigTitle = shouldUseDarkColors ? defaultDarkPaletteTiddler : defaultLightPaletteTiddler;
  const paletteTitle = wikiInstance.wiki.getTiddlerText(defaultPaletteConfigTitle, '');
  if (!paletteTitle) return;

  const existingPaletteTiddler = wikiInstance.wiki.getTiddler(paletteTiddlerTitle) ?? {};
  wikiInstance.wiki.addTiddler(
    new wikiInstance.Tiddler(existingPaletteTiddler, {
      title: paletteTiddlerTitle,
      text: paletteTitle,
    }),
  );
}
