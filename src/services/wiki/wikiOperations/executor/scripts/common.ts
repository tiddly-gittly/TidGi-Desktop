import { WikiChannel } from '@/constants/channels';

interface IAddTiddlerOptionOptions {
  withDate?: boolean;
}

export const wikiOperationScripts = {
  [WikiChannel.setState]: (stateKey: string, content: string) => `
      $tw.wiki.addTiddler({ title: '$:/state/${stateKey}', text: \`${content}\` });
    `,
  /**
   * add tiddler
   *
   * @param title tiddler title
   * @param text tiddler text
   * @param options stringifyed JSON object, is `{}` by default.
   * @param extraMeta extra meta data, is `{}` by default, a JSONStringified object
   *
   * ## options
   *
   * - withDate: boolean, whether to add `created` and `modified` field to tiddler
   */
  [WikiChannel.addTiddler]: (title: string, text: string, extraMeta = '{}', optionsString = '{}') => {
    const options = JSON.parse(optionsString) as IAddTiddlerOptionOptions;
    return `
      const dateObject = {};
      ${
      options.withDate === true
        ? `
      const existedTiddler = $tw.wiki.getTiddler(\`${title}\`);
      let created = existedTiddler?.fields?.created;
      const modified = $tw.utils.stringifyDate(new Date());
      if (!existedTiddler) {
        created = $tw.utils.stringifyDate(new Date());
      }
      dateObject.created = created;
      dateObject.modified = modified;
      `
        : ''
    }
      $tw.wiki.addTiddler({ title: \`${title}\`, text: \`${text}\`, ...${extraMeta}, ...dateObject });
    `;
  },
  [WikiChannel.getTiddlerText]: (title: string) => `
    $tw.wiki.getTiddlerText(\`${title}\`);
  `,
  [WikiChannel.runFilter]: (filter: string) => `
    $tw.wiki.compileFilter(\`${filter}\`)()
  `,
  /**
   * Modified from `$tw.wiki.getTiddlersAsJson` (it will turn tags into string, so we are not using it.)
   * This modified version will return Object
   */
  [WikiChannel.getTiddlersAsJson]: (filter: string) => `
    $tw.wiki.filterTiddlers(\`${filter}\`).map(title => {
      const tiddler = $tw.wiki.getTiddler(title);
      return tiddler?.fields;
    }).filter(item => item !== undefined)
  `,
  [WikiChannel.setTiddlerText]: (title: string, value: string) => `
    $tw.wiki.setText(\`${title}\`, 'text', undefined, \`${value}\`);
  `,
  [WikiChannel.renderWikiText]: (content: string) => `
    $tw.wiki.renderText("text/html", "text/vnd.tiddlywiki", \`${content.replaceAll('`', '\\`')}\`);
  `,
  [WikiChannel.openTiddler]: (tiddlerName: string) => `
    let trimmedTiddlerName = \`${tiddlerName.replaceAll('\n', '')}\`;
    let currentHandlerWidget = $tw.rootWidget;
    let handled = false;
    while (currentHandlerWidget && !handled) {
      const bubbled = currentHandlerWidget.dispatchEvent({ type: "tm-navigate", navigateTo: trimmedTiddlerName, param: trimmedTiddlerName });
      handled = !bubbled;
      currentHandlerWidget = currentHandlerWidget.children?.[0];
    }
  `,
  [WikiChannel.sendActionMessage]: (actionMessage: string) => `
    $tw.rootWidget.dispatchEvent({ type: \`${actionMessage}\` });
  `,
  [WikiChannel.deleteTiddler]: (title: string) => `
    $tw.wiki.deleteTiddler(\`${title}\`);
  `,
} as const;
