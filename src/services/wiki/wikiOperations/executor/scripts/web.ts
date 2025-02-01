import { WikiChannel } from '@/constants/channels';
import { wikiOperationScripts as common } from './common';

async function generateHTML(title: string, tiddlerDiv: HTMLElement): Promise<string> {
  /* eslint-disable unicorn/prefer-spread */
  const clonedDiv = tiddlerDiv.cloneNode(true) as HTMLElement;
  const styleTags = Array.from(document.querySelectorAll('style')).map(style => style.outerHTML).join('\\n');

  const imgTags = clonedDiv.querySelectorAll('img');
  for (const img of Array.from(imgTags)) {
    const source = img.getAttribute('src');
    if (source !== null && !(source.startsWith('http') || source.startsWith('data'))) {
      const response = await fetch(source);
      const blob = await response.blob();
      const reader = new FileReader();
      await new Promise<void>(resolve => {
        reader.onloadend = () => {
          img.setAttribute('src', reader.result as string);
          resolve();
        };
        reader.readAsDataURL(blob);
      });
    }
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        ${styleTags}
      </head>
      <body>
        ${clonedDiv.outerHTML}
      </body>
    </html>
  `;
  /* eslint-enable unicorn/prefer-spread */
}

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
  [WikiChannel.renderTiddlerOuterHTML]: (title: string) => `
    const tiddlerDiv = document.querySelector('div[data-tiddler-title="${title}"]');
    if (tiddlerDiv) {
      return await (${generateHTML.toString()})('${title}', tiddlerDiv);
    }
    return '';
  `,
} as const;
