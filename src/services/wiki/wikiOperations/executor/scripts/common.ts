import { WikiChannel } from '@/constants/channels';

interface IAddTiddlerOptionOptions {
  withDate?: boolean;
}

export const wikiOperationScripts = {
  [WikiChannel.setState]: (stateKey: string, content: string) => `
    return $tw.wiki.addTiddler({ title: '$:/state/${stateKey}', text: ${JSON.stringify(content)} });
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
      const existedTiddler = $tw.wiki.getTiddler(${JSON.stringify(title)});
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
      return $tw.wiki.addTiddler({ title: ${JSON.stringify(title)}, text: ${JSON.stringify(text)}, ...${extraMeta}, ...dateObject });
    `;
  },
  [WikiChannel.getTiddlerText]: (title: string) => `
    return $tw.wiki.getTiddlerText(${JSON.stringify(title)});
  `,
  [WikiChannel.runFilter]: (filter: string) => `
    return $tw.wiki.compileFilter(${JSON.stringify(filter)})()
  `,
  /**
   * Modified from `$tw.wiki.getTiddlersAsJson` (it will turn tags into string, so we are not using it.)
   * This modified version will return Object
   */
  [WikiChannel.getTiddlersAsJson]: (filter: string) => `
    return $tw.wiki.filterTiddlers(${JSON.stringify(filter)}).map(title => {
      const tiddler = $tw.wiki.getTiddler(title);
      return tiddler?.fields;
    }).filter(item => item !== undefined)
  `,
  [WikiChannel.setTiddlerText]: (title: string, value: string) => `
    return $tw.wiki.setText(${JSON.stringify(title)}, 'text', undefined, ${JSON.stringify(value)});
  `,
  [WikiChannel.renderWikiText]: (content: string) => `
    return $tw.wiki.renderText("text/html", "text/vnd.tiddlywiki", ${JSON.stringify(content)});
  `,
  [WikiChannel.dispatchEvent]: (actionMessage: string) => `
    return $tw.rootWidget.dispatchEvent({ type: ${JSON.stringify(actionMessage)} });
  `,
  [WikiChannel.deleteTiddler]: (title: string) => `
    return $tw.wiki.deleteTiddler(${JSON.stringify(title)});
  `,
  [WikiChannel.getTiddler]: (title: string) => `
    return $tw.wiki.getTiddler(${JSON.stringify(title)});
  `,
  [WikiChannel.invokeActionsByTag]: (tag: string, stringifiedData: string) => `
    const event = new Event('TidGi-invokeActionByTag');
    return $tw.rootWidget.invokeActionsByTag(${JSON.stringify(tag)},event,${stringifiedData});
  `,
  /**
   * Invoke a specific action tiddler by title with variables
   * This is more precise than invokeActionsByTag as it executes exactly one action
   *
   * @param title - The title of the action tiddler to execute
   * @param stringifiedData - Stringified JSON object containing variables to pass to the action
   */
  invokeActionString: (title: string, stringifiedData: string) => `
    const actionText = $tw.wiki.getTiddlerText(${JSON.stringify(title)});
    if (!actionText) {
      throw new Error('Action tiddler not found: ' + ${JSON.stringify(title)});
    }
    const event = new Event('TidGi-invokeActionString');
    Object.assign(event, ${stringifiedData});
    return $tw.rootWidget.invokeActionString(actionText, event, ${stringifiedData});
  `,
} as const;
