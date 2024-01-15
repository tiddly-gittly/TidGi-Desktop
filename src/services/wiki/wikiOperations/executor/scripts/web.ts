import { WikiChannel } from '@/constants/channels';
import { wikiOperationScripts as common } from './common';

export const wikiOperationScripts = {
  ...common,
  [WikiChannel.syncProgress]: (message: string) => `
    $tw.wiki.addTiddler({ title: '$:/state/notification/${WikiChannel.syncProgress}', text: \`${message}\` });
    return $tw.notifier.display('$:/state/notification/${WikiChannel.syncProgress}');
  `,

  [WikiChannel.generalNotification]: (message: string) => `
    $tw.wiki.addTiddler({ title: \`$:/state/notification/${WikiChannel.generalNotification}\`, text: \`${message}\` });
    return $tw.notifier.display(\`$:/state/notification/${WikiChannel.generalNotification}\`);
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
    return handled;
  `,

  [WikiChannel.printTiddler]: async (tiddlerName: string) => {
    const printer = await import('../../../../libs/printer');
    return `
      var page = (${printer.printTiddler.toString()})(\`${tiddlerName}\`);
      page?.print?.();
      page?.close?.();
    `;
  },
} as const;
