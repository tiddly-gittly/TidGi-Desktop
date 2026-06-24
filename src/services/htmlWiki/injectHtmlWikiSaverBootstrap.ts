/**
 * Primary save path for HTML workspaces.
 *
 * This script is injected into the served wiki document and patches TiddlyWiki's
 * saver flow before it reaches DownloadSaver. `htmlWikiDownloadIntercept` remains
 * as an Electron-level fallback for generated HTML downloads that still escape.
 */
export const HTML_WIKI_SAVER_BOOTSTRAP_SCRIPT_ID = 'tidgi-html-wiki-saver-bootstrap';

interface IHtmlWikiSaveWindow extends Window {
  $tw?: {
    language: { getString: (title: string) => string };
    notifier: { display: (title: string) => void };
    saverHandler?: {
      numChanges: number;
      saveWiki: (options?: Record<string, unknown>) => boolean;
      titleSavedNotification: string;
      updateDirtyStatus: () => void;
      wiki: {
        getTiddlerText: (title: string, defaultText?: string) => string;
        renderTiddler: (type: string, template: string, options?: Record<string, unknown>) => string;
      };
    };
  };
  __tidgiHtmlWikiSaverInstalled?: boolean;
  __tidgiSaverHandlerPatched?: boolean;
  tidgiHtmlWikiSave?: (htmlContent: string) => Promise<void>;
}

interface ISaveWikiOptions extends Record<string, unknown> {
  callback?: () => void;
  downloadType?: string;
  method?: string;
  template?: string;
  wiki?: NonNullable<NonNullable<IHtmlWikiSaveWindow['$tw']>['saverHandler']>['wiki'];
}

function installHtmlWikiSaverBootstrap(): void {
  const currentWindow = window as IHtmlWikiSaveWindow;
  if (currentWindow.__tidgiHtmlWikiSaverInstalled) {
    return;
  }
  currentWindow.__tidgiHtmlWikiSaverInstalled = true;

  const ensureMessageBox = () => {
    let box = document.getElementById('tiddlyfox-message-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tiddlyfox-message-box';
      box.style.display = 'none';
      (document.body || document.documentElement).appendChild(box);
    }
    return box;
  };

  const persistHtml = (content: string, onSuccess: () => void, onError: (error: Error) => void) => {
    const finishBridge = () => {
      if (typeof currentWindow.tidgiHtmlWikiSave !== 'function') {
        onError(new Error('tidgiHtmlWikiSave bridge is not available'));
        return;
      }
      void currentWindow.tidgiHtmlWikiSave(content).then(onSuccess).catch((error: unknown) => {
        onError(error instanceof Error ? error : new Error(String(error)));
      });
    };
    if (/^tidgi:/.test(document.location.protocol)) {
      finishBridge();
      return;
    }
    finishBridge();
  };

  const box = ensureMessageBox();
  box.addEventListener('tiddlyfox-save-file', (event) => {
    const message = event.target;
    if (!(message instanceof Element)) {
      return;
    }
    const content = message.getAttribute('data-tiddlyfox-content');
    if (!content) {
      return;
    }
    persistHtml(
      content,
      () => {
        message.dispatchEvent(new CustomEvent('tiddlyfox-have-saved-file', { bubbles: true, cancelable: false }));
      },
      (error) => {
        alert(error.message);
      },
    );
  }, false);

  const patchSaverHandler = () => {
    if (!currentWindow.$tw?.saverHandler || currentWindow.__tidgiSaverHandlerPatched) {
      return false;
    }
    const saverHandler = currentWindow.$tw.saverHandler;
    const originalSaveWiki = saverHandler.saveWiki.bind(saverHandler);
    saverHandler.saveWiki = function patchedSaveWiki(options?: ISaveWikiOptions) {
      options = options || {};
      const method = options.method || 'save';
      if (!/^tidgi:/.test(document.location.protocol) || method === 'download') {
        return originalSaveWiki(options);
      }
      const wiki = options.wiki || this.wiki;
      const template = (options.template || wiki.getTiddlerText('$:/config/SaveWikiButton/Template', '$:/core/save/all')).trim();
      const downloadType = options.downloadType || 'text/html';
      const text = wiki.renderTiddler(downloadType, template, options);
      const callback = (errorMessage?: string) => {
        if (errorMessage) {
          alert(currentWindow.$tw!.language.getString('Error/WhileSaving') + ':\n\n' + errorMessage);
          return;
        }
        saverHandler.numChanges = 0;
        saverHandler.updateDirtyStatus();
        currentWindow.$tw!.notifier.display(saverHandler.titleSavedNotification);
        if (options.callback) {
          options.callback();
        }
      };
      persistHtml(
        text,
        () => {
          callback();
        },
        (error) => {
          callback(error.message);
        },
      );
      return true;
    };
    currentWindow.__tidgiSaverHandlerPatched = true;
    return true;
  };

  let attempts = 0;
  const tryPatch = () => {
    if (patchSaverHandler() || attempts >= 200) {
      return;
    }
    attempts += 1;
    window.setTimeout(tryPatch, 50);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryPatch, { once: true });
  } else {
    tryPatch();
  }
  window.addEventListener('load', tryPatch, { once: true });
}

export const htmlWikiSaverBootstrapScript = `(${installHtmlWikiSaverBootstrap.toString()})();`;

export function injectHtmlWikiSaverBootstrap(html: string): string {
  if (html.includes(HTML_WIKI_SAVER_BOOTSTRAP_SCRIPT_ID)) {
    return html;
  }
  const scriptTag = `<script id="${HTML_WIKI_SAVER_BOOTSTRAP_SCRIPT_ID}">${htmlWikiSaverBootstrapScript}</script>`;
  const headMatch = /<head[^>]*>/i.exec(html);
  if (headMatch) {
    const insertAt = headMatch.index + headMatch[0].length;
    return `${html.slice(0, insertAt)}${scriptTag}${html.slice(insertAt)}`;
  }
  return `${scriptTag}${html}`;
}
