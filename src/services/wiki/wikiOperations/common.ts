import { WikiChannel } from '@/constants/channels';

export const wikiOperations = {
  [WikiChannel.setState]: (stateKey: string, content: string) => `
      $tw.wiki.addTiddler({ title: '$:/state/${stateKey}', text: \`${content}\` });
    `,
  [WikiChannel.addTiddler]: (nonceReceived: number, title: string, text: string, extraMeta = '{}', optionsString = '{}') => {
    const options = JSON.parse(optionsString) as { withDate?: boolean };
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

  [WikiChannel.syncProgress]: (message: string) => `
  $tw.wiki.addTiddler({ title: '$:/state/notification/${WikiChannel.syncProgress}', text: \`${message}\` });
  $tw.notifier.display('$:/state/notification/${WikiChannel.syncProgress}');
`,

  [WikiChannel.generalNotification]: (message: string) => `
  $tw.wiki.addTiddler({ title: \`$:/state/notification/${WikiChannel.generalNotification}\`, text: \`${message}\` });
  $tw.notifier.display(\`$:/state/notification/${WikiChannel.generalNotification}\`);
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

  [WikiChannel.printTiddler]: (tiddlerName: string) => `
  var page = (${printer.printTiddler.toString()})(\`${tiddlerName}\`);
  page?.print?.();
  page?.close?.();
`,
};
