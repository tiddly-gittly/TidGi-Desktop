import { Then, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import { executeTiddlyWikiCode } from '../supports/webContentsViewHelper';
import type { ApplicationWorld } from './application';

const FULL_MODE = 'full';
const SIDEBAR_MODE = 'sidebar';
const SOURCE_TITLE = 'MemeLoop E2E Attachment';
const SOURCE_MARKER = 'MEMELOOP_REAL_TIDDLER_CONTENT_8f4d2b';
const DRAG_HARNESS_TITLE = 'MemeLoop E2E Drag Source';
const ROOT_TEST_ID_PREFIX = 'memeloop-wiki-agent-';

type WikiEntryMode = typeof FULL_MODE | typeof SIDEBAR_MODE;

const RETRY_OPTIONS = {
  numOfAttempts: 20,
  startingDelay: 100,
  timeMultiple: 1,
  maxDelay: 100,
} as const;

function assertWikiApplication(world: ApplicationWorld): asserts world is ApplicationWorld & { app: NonNullable<ApplicationWorld['app']> } {
  if (!world.app) throw new Error('Application not launched');
}

function parseWikiEntryMode(mode: string): WikiEntryMode {
  if (mode === FULL_MODE || mode === SIDEBAR_MODE) return mode;
  throw new Error(`Unknown MemeLoop wiki entry mode: ${mode}`);
}

async function retryWikiAssertion<T>(
  world: ApplicationWorld,
  description: string,
  script: string,
): Promise<T> {
  assertWikiApplication(world);
  let lastResult: unknown;
  return await backOff(
    async () => {
      lastResult = await executeTiddlyWikiCode<T | { error: string }>(world.app, script, world.currentWindow);
      if (lastResult === null) throw new Error(`${description}: Wiki renderer returned null`);
      if (typeof lastResult === 'object' && lastResult !== null && 'error' in lastResult) {
        throw new Error(`${description}: ${String(lastResult.error)}`);
      }
      return lastResult as T;
    },
    RETRY_OPTIONS,
  ).catch((error: unknown) => {
    throw new Error(`${description} failed; last result: ${JSON.stringify(lastResult)}; ${String(error)}`);
  });
}

function rootSelector(mode: WikiEntryMode): string {
  return `[data-testid="${ROOT_TEST_ID_PREFIX}${mode}"]`;
}

When('I open the packaged MemeLoop wiki main view and sidebar with a real draggable tiddler', async function(this: ApplicationWorld) {
  assertWikiApplication(this);
  const result = await executeTiddlyWikiCode<{ error?: string; success?: boolean }>(
    this.app,
    `(function() {
      const sourceTitle = ${JSON.stringify(SOURCE_TITLE)};
      const harnessTitle = ${JSON.stringify(DRAG_HARNESS_TITLE)};
      $tw.wiki.addTiddler(new $tw.Tiddler({
        title: sourceTitle,
        text: ${JSON.stringify(`This is a real persisted TiddlyWiki tiddler. ${SOURCE_MARKER}`)},
        type: 'text/vnd.tiddlywiki',
        tags: ['MemeLoopE2E']
      }));
      $tw.wiki.addTiddler(new $tw.Tiddler({
        title: harnessTitle,
        text: '<$draggable tiddler=' + JSON.stringify(sourceTitle) + ' class="memeloop-e2e-drag-source">Drag real tiddler: ' + sourceTitle + '</$draggable>',
        type: 'text/vnd.tiddlywiki'
      }));
      for (const title of [harnessTitle, 'MemeLoop Agent']) {
        try { $tw.wiki.removeFromStory(title); } catch {}
        $tw.wiki.addToStory(title, undefined, '$:/StoryList', { openLinkFromOutsideRiver: 'top' });
      }
      if ($tw.pageWidgetNode?.refresh) {
        const changes = Object.create(null);
        changes['$:/StoryList'] = { modified: true, normal: true };
        changes[sourceTitle] = { modified: true, normal: true };
        changes[harnessTitle] = { modified: true, normal: true };
        $tw.pageWidgetNode.refresh(changes);
      }
      $tw.hooks?.invokeHook?.('th-page-refreshed');
      const sidebarButton = Array.from(document.querySelectorAll('.tc-sidebar-lists .tc-tab-buttons button, .tc-sidebar-lists .tc-tab-buttons a'))
        .find(element => (element.textContent || '').includes('MemeLoop'));
      if (!(sidebarButton instanceof HTMLElement)) {
        return { error: 'Packaged MemeLoop sidebar tab button was not rendered' };
      }
      sidebarButton.click();
      return { success: true };
    })()`,
    this.currentWindow,
  );
  if (!result?.success) throw new Error(result?.error ?? 'Failed to prepare the packaged MemeLoop wiki plugin');
});

Then('both MemeLoop wiki entries should use the shared chat UI and the sidebar should be narrow', async function(this: ApplicationWorld) {
  const result = await retryWikiAssertion<{
    agentCount: number;
    fullWidth: number;
    sidebarFlexDirection: string;
    sidebarWidth: number;
  }>(
    this,
    'MemeLoop full/sidebar shared UI readiness',
    `(async function() {
      const full = document.querySelector(${JSON.stringify(rootSelector(FULL_MODE))});
      const sidebar = document.querySelector(${JSON.stringify(rootSelector(SIDEBAR_MODE))});
      if (!(full instanceof HTMLElement) || full.offsetParent === null) return { error: 'Full MemeLoop wiki entry is not visible' };
      if (!(sidebar instanceof HTMLElement) || sidebar.offsetParent === null) return { error: 'Sidebar MemeLoop wiki entry is not visible' };
      for (const [mode, root] of [['full', full], ['sidebar', sidebar]]) {
        if (!root.querySelector('[data-testid="memeloop-agent-chat"]')) return { error: mode + ' entry did not render shared AgentChatView' };
        if (!root.querySelector('[data-testid="agent-message-input"]')) return { error: mode + ' entry is not ready for messages' };
        if (!root.querySelector('[data-testid="agent-send-button"]')) return { error: mode + ' entry did not render shared MemeLoop composer' };
      }
      const sidebarSelectors = sidebar.querySelector('.memeloop-tw-chat__selectors');
      if (!(sidebarSelectors instanceof HTMLElement)) return { error: 'Sidebar selectors are not rendered' };
      const agents = await window.service.agentInstance.getAgents(1, 10, { closed: false });
      return {
        agentCount: agents.length,
        fullWidth: full.getBoundingClientRect().width,
        sidebarFlexDirection: getComputedStyle(sidebarSelectors).flexDirection,
        sidebarWidth: sidebar.getBoundingClientRect().width
      };
    })()`,
  );
  if (result.agentCount !== 1) throw new Error(`Expected one shared agent for both wiki entries, got ${result.agentCount}`);
  if (result.sidebarWidth <= 0 || result.sidebarWidth > 480) {
    throw new Error(`Expected a visible narrow sidebar no wider than 480px, got ${result.sidebarWidth}px`);
  }
  if (result.fullWidth <= result.sidebarWidth) {
    throw new Error(`Expected the main view (${result.fullWidth}px) to be wider than the sidebar (${result.sidebarWidth}px)`);
  }
  if (result.sidebarFlexDirection !== 'column') {
    throw new Error(`Expected narrow container layout for sidebar selectors, got ${result.sidebarFlexDirection}`);
  }
});

When('I drag the real wiki tiddler into the {string} MemeLoop wiki entry', async function(this: ApplicationWorld, rawMode: string) {
  const mode = parseWikiEntryMode(rawMode);
  await retryWikiAssertion<boolean>(
    this,
    `real TiddlyWiki drag into ${mode} MemeLoop entry`,
    `(function() {
      const source = document.querySelector('.memeloop-e2e-drag-source');
      const root = document.querySelector(${JSON.stringify(rootSelector(mode))});
      const target = root?.querySelector('[data-testid="memeloop-agent-chat"]');
      if (!(source instanceof HTMLElement) || source.offsetParent === null) return { error: 'Real TiddlyWiki draggable source is not visible' };
      if (!(target instanceof HTMLElement) || target.offsetParent === null) return { error: 'MemeLoop drop target is not visible' };
      const dataTransfer = new DataTransfer();
      const dragStarted = source.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer
      }));
      const payload = dataTransfer.getData('text/vnd.tiddler');
      if (!payload) return { error: 'TiddlyWiki dragstart did not produce its canonical text/vnd.tiddler payload' };
      const fields = JSON.parse(payload);
      if (!fields || fields.title !== ${JSON.stringify(SOURCE_TITLE)}) {
        return { error: 'Canonical TiddlyWiki payload did not come from the real source tiddler' };
      }
      target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
      return dragStarted || !dragStarted;
    })()`,
  );
});

Then('the {string} MemeLoop wiki entry should show the dropped tiddler attachment', async function(this: ApplicationWorld, rawMode: string) {
  const mode = parseWikiEntryMode(rawMode);
  await retryWikiAssertion<boolean>(
    this,
    `${mode} MemeLoop attachment chip`,
    `(function() {
      const root = document.querySelector(${JSON.stringify(rootSelector(mode))});
      const chip = root?.querySelector('[data-testid="wiki-tiddler-chip-0"]');
      if (!(chip instanceof HTMLElement)) return { error: 'Dropped tiddler chip is not rendered' };
      if (!(chip.textContent || '').includes(${JSON.stringify(SOURCE_TITLE)})) return { error: 'Attachment chip has the wrong tiddler title' };
      return true;
    })()`,
  );
});

When('I send {string} from the {string} MemeLoop wiki entry', async function(this: ApplicationWorld, text: string, rawMode: string) {
  const mode = parseWikiEntryMode(rawMode);
  await retryWikiAssertion<boolean>(
    this,
    `send a message from the ${mode} MemeLoop entry`,
    `(async function() {
      const root = document.querySelector(${JSON.stringify(rootSelector(mode))});
      const input = root?.querySelector('[data-testid="agent-message-input"]');
      if (!(input instanceof HTMLTextAreaElement)) return { error: 'MemeLoop composer textarea is unavailable' };
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!valueSetter) return { error: 'Native textarea value setter is unavailable' };
      input.focus();
      valueSetter.call(input, ${JSON.stringify(text)});
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${JSON.stringify(text)}, inputType: 'insertText' }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const button = root?.querySelector('[data-testid="agent-send-button"]');
      if (!(button instanceof HTMLButtonElement)) return { error: 'MemeLoop send button is unavailable' };
      if (button.disabled) return { error: 'MemeLoop send button is disabled after entering text' };
      button.click();
      return true;
    })()`,
  );
});

Then(
  'both MemeLoop wiki entries should show {int} synchronized messages containing {string}',
  async function(this: ApplicationWorld, expectedCount: number, expectedText: string) {
    await retryWikiAssertion<boolean>(
      this,
      `both MemeLoop wiki entries synchronized to ${expectedCount} messages`,
      `(function() {
        for (const mode of ['full', 'sidebar']) {
          const root = document.querySelector('[data-testid="${ROOT_TEST_ID_PREFIX}' + mode + '"]');
          if (!(root instanceof HTMLElement)) return { error: mode + ' MemeLoop entry is missing' };
          const messages = root.querySelectorAll('[data-testid="message-bubble"]');
          if (messages.length !== ${expectedCount}) return { error: mode + ' has ' + messages.length + ' messages, expected ${expectedCount}' };
          if (![...messages].some(message => (message.textContent || '').includes(${JSON.stringify(expectedText)}))) {
            return { error: mode + ' does not contain synchronized response ${expectedText}' };
          }
        }
        return true;
      })()`,
    );
  },
);

Then('both wiki attachment requests should contain the real tiddler content', async function(this: ApplicationWorld) {
  if (!this.mockOpenAIServer) throw new Error('Mock OpenAI server is not running');
  const requests = await backOff(
    async () => {
      const all = this.mockOpenAIServer!.getAllRequests();
      if (all.length < 2) throw new Error(`Expected two AI requests, got ${all.length}`);
      return all.slice(-2);
    },
    RETRY_OPTIONS,
  );
  for (const [index, request] of requests.entries()) {
    const userContent = request.messages
      .filter(message => message.role === 'user')
      .map(message => message.content ?? '')
      .join('\n');
    if (!userContent.includes(SOURCE_TITLE) || !userContent.includes(SOURCE_MARKER)) {
      throw new Error(`AI request ${index + 1} did not contain the real wiki tiddler attachment: ${userContent}`);
    }
  }
});
