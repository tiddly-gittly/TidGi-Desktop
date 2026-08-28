import { Given, Then, When } from '@cucumber/cucumber';
import { validateConversationTimelineResult } from '@memeloop/react-ui/chat/core';
import { backOff } from 'exponential-backoff';
import type { Locator, Page } from 'playwright';

import { CUCUMBER_GLOBAL_TIMEOUT } from '../supports/timeouts';
import type { ApplicationWorld } from './application';

interface LongConversationFixture {
  agentId: string;
  turnCount: number;
  messageCount: number;
  compactionCount: number;
  initialFirstMessageId?: string;
}

const fixtures = new WeakMap<ApplicationWorld, LongConversationFixture>();

function currentPage(world: ApplicationWorld): Page {
  const page = world.currentWindow ?? world.mainWindow;
  if (!page) throw new Error('No current packaged renderer page is available');
  return page;
}

function fixture(world: ApplicationWorld): LongConversationFixture {
  const value = fixtures.get(world);
  if (!value) throw new Error('Long-conversation fixture has not been seeded');
  return value;
}

async function retry<T>(operation: () => Promise<T>): Promise<T> {
  return backOff(operation, {
    // Keep assertions comfortably inside Cucumber's global timeout so the
    // final domain-specific failure is reported instead of a generic timeout.
    numOfAttempts: Math.max(8, Math.min(80, Math.floor(CUCUMBER_GLOBAL_TIMEOUT / 100))),
    startingDelay: 100,
    timeMultiple: 1,
    maxDelay: 100,
  });
}

async function messageIds(page: Page): Promise<string[]> {
  return page.locator('[data-testid="message-bubble"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-memeloop-message-id') ?? ''));
}

async function assertResidentBound(page: Page, maximum: number): Promise<string[]> {
  return retry(async () => {
    const ids = await messageIds(page);
    if (ids.length === 0 || ids.length > maximum) {
      throw new Error(`Expected 1-${maximum} resident message nodes, found ${ids.length}`);
    }
    if (new Set(ids).size !== ids.length || ids.some(id => id.length === 0)) {
      throw new Error('Resident message identities are missing or duplicated');
    }
    return ids;
  });
}

async function waitForText(locator: Locator, expected: string): Promise<void> {
  await retry(async () => {
    const text = await locator.textContent({ timeout: 1_000 });
    if (!text?.includes(expected)) throw new Error(`Expected renderer text to contain ${expected}`);
  });
}

Given(
  'I seed the active packaged agent with {int} long-conversation turns and repeated compactions',
  async function(this: ApplicationWorld, turnCount: number) {
    const page = currentPage(this);
    const result = await page.evaluate(async requestedTurnCount => {
      const agents = await window.service.agentInstance.getAgents(1, 20, { closed: false });
      const active = agents[0];
      if (!active) throw new Error('No active Agent instance exists for the long-conversation seed');
      return window.service.agentInstance.seedLongConversationForE2E({
        conversationId: active.id,
        turnCount: requestedTurnCount,
      });
    }, turnCount);
    if (result.turnCount !== turnCount || result.messageCount !== turnCount * 2 || result.compactionCount < 2) {
      throw new Error(`Unexpected long-conversation seed result: ${JSON.stringify(result)}`);
    }
    fixtures.set(this, {
      agentId: result.conversationId,
      turnCount: result.turnCount,
      messageCount: result.messageCount,
      compactionCount: result.compactionCount,
    });
    const lastNumber = (turnCount - 1).toString().padStart(5, '0');
    await waitForText(page.locator('[data-testid="conversation-viewport"]'), `E2E long answer ${lastNumber}`);
  },
);

Then(
  'the long-conversation renderer should keep its initial DOM bounded at {int} messages and {int} timeline markers',
  async function(this: ApplicationWorld, maximumMessages: number, maximumMarkers: number) {
    const page = currentPage(this);
    const state = fixture(this);
    const ids = await assertResidentBound(page, maximumMessages);
    state.initialFirstMessageId = ids[0];
    const hostTimeline = await page.evaluate(async conversationId => {
      return window.service.agentInstance.getAgentConversationTimelinePage(conversationId, {
        limit: 50,
        maxBytes: 256 * 1024,
      });
    }, state.agentId);
    if (hostTimeline.reset) throw new Error(`Host timeline unexpectedly reset to revision ${hostTimeline.revision}`);
    if (hostTimeline.items.length === 0 || hostTimeline.items.length > maximumMarkers) {
      throw new Error(`Host timeline returned ${hostTimeline.items.length} entries outside the 1-${maximumMarkers} page bound`);
    }
    const expectedEntries = state.turnCount + state.compactionCount;
    if (hostTimeline.totalEntries !== expectedEntries) {
      throw new Error(`Expected ${expectedEntries} durable host timeline entries, found ${hostTimeline.totalEntries}`);
    }
    validateConversationTimelineResult(hostTimeline, state.agentId);

    await retry(async () => {
      const timeline = page.locator('[data-testid="conversation-timeline"]');
      const markers = timeline.locator('[data-timeline-entry-index]');
      const markerCount = await markers.count();
      if (markerCount === 0 || markerCount > maximumMarkers) {
        throw new Error(`Expected 1-${maximumMarkers} timeline markers, found ${markerCount}`);
      }
      const totalEntries = Number(await markers.last().getAttribute('aria-setsize'));
      if (totalEntries !== expectedEntries) {
        throw new Error(`Expected ${expectedEntries} absolute timeline entries, found ${totalEntries}`);
      }
      const scrollMetrics = await timeline.evaluate(element => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      if (scrollMetrics.scrollHeight <= scrollMetrics.clientHeight) {
        throw new Error('Long timeline did not expose a virtual scroll range');
      }
    });
  },
);

Then(
  'hovering the latest timeline marker should show the latest user and assistant previews',
  async function(this: ApplicationWorld) {
    const page = currentPage(this);
    const state = fixture(this);
    const lastNumber = (state.turnCount - 1).toString().padStart(5, '0');
    const marker = page.locator(`[data-timeline-entry-index="${state.turnCount + state.compactionCount - 1}"]`);
    await marker.hover();
    const tooltip = page.getByRole('tooltip');
    await waitForText(tooltip, `E2E long question ${lastNumber}`);
    await waitForText(tooltip, `E2E long answer ${lastNumber}`);
  },
);

When('I load one earlier resident message page', async function(this: ApplicationWorld) {
  const page = currentPage(this);
  const state = fixture(this);
  const before = state.initialFirstMessageId ?? (await messageIds(page))[0];
  if (!before) throw new Error('The initial resident message window is empty');
  const loadEarlier = page.locator('[data-testid="conversation-viewport"] > button').first();
  await loadEarlier.click();
  await retry(async () => {
    const after = (await messageIds(page))[0];
    if (!after || after === before) throw new Error('The resident window has not moved to an earlier page');
  });
});

Then(
  'the resident message window should move earlier while remaining bounded at {int} messages',
  async function(this: ApplicationWorld, maximumMessages: number) {
    const state = fixture(this);
    const ids = await assertResidentBound(currentPage(this), maximumMessages);
    if (ids[0] === state.initialFirstMessageId) {
      throw new Error('Loading earlier did not replace the resident window boundary');
    }
  },
);

When('I seek the conversation timeline to its first absolute entry', async function(this: ApplicationWorld) {
  const page = currentPage(this);
  const state = fixture(this);
  const hostPage = await page.evaluate(async conversationId => {
    return window.service.agentInstance.getAgentConversationTimelinePage(conversationId, {
      aroundEntryIndex: 0,
      limit: 50,
      maxBytes: 256 * 1024,
    });
  }, state.agentId);
  if (hostPage.reset || hostPage.items[0]?.entryIndex !== 0 || hostPage.items[0]?.kind !== 'turn' || !hostPage.items[0].turnId.endsWith(':00000')) {
    throw new Error(`Host absolute timeline entry zero is invalid: ${JSON.stringify(hostPage)}`);
  }
  const timeline = page.locator('[data-testid="conversation-timeline"]');
  await timeline.evaluate(element => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  const firstMarker = page.locator('[data-timeline-entry-index="0"]');
  await retry(async () => {
    if (await firstMarker.count() !== 1) throw new Error('Absolute timeline seek has not loaded entry zero');
  });
  await retry(async () => {
    await firstMarker.evaluate(
      element => {
        if (!(element instanceof HTMLButtonElement)) throw new Error('Absolute timeline entry zero is not a button');
        element.click();
      },
      undefined,
      { timeout: 1_000 },
    );
  });
  await waitForText(page.locator('[data-testid="conversation-viewport"]'), 'E2E long question 00000');
  await retry(async () => {
    const markerState = await page.locator('[data-timeline-entry-index]').evaluateAll(elements =>
      elements.map(element => ({
        entryIndex: element.getAttribute('data-timeline-entry-index'),
        current: element.getAttribute('aria-current'),
      }))
    );
    if (!markerState.some(marker => marker.entryIndex === '0' && marker.current === 'location')) {
      throw new Error(`Absolute timeline entry zero was not activated: ${JSON.stringify(markerState)}`);
    }
  });
});

Then(
  'the first long-conversation turn should be rendered in a bounded resident window',
  async function(this: ApplicationWorld) {
    const page = currentPage(this);
    const ids = await assertResidentBound(page, 50);
    if (!ids.some(id => id.endsWith(':00000'))) {
      throw new Error('Absolute seek did not render the first durable turn');
    }
    const marker = page.locator('[data-timeline-entry-index="0"]');
    if (await marker.getAttribute('aria-posinset') !== '1') {
      throw new Error('The first timeline marker lost its absolute accessibility position');
    }
  },
);

When('I open the generated model-request prompt audit', async function(this: ApplicationWorld) {
  const page = currentPage(this);
  // This toolbar button cannot navigate. On Windows, a still-settling Wiki
  // navigation can otherwise make Playwright wait after the click even though
  // the button event has completed. The dialog and every audit surface are
  // asserted explicitly below, so navigation waiting would add no coverage.
  await page.locator('[data-testid="prompt-preview-button"]').click({ noWaitAfter: true });
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: CUCUMBER_GLOBAL_TIMEOUT });
  const tabs = dialog.getByRole('tab');
  try {
    // Building an execution-equivalent request reads durable history and
    // compaction controls in the host. Give that real work a bounded budget
    // instead of the short polling budget used for renderer-only assertions.
    await tabs.nth(1).waitFor({
      state: 'visible',
      timeout: Math.min(60_000, CUCUMBER_GLOBAL_TIMEOUT - 1_000),
    });
  } catch (error) {
    throw new Error(`Prompt preview tabs are not ready: ${(await dialog.innerText()).slice(0, 1_024)}`, { cause: error });
  }
  await dialog.getByRole('tab').nth(1).click();
  await retry(async () => {
    if (await dialog.locator('[data-testid="prompt-preview-execution-audit"]').count() !== 1) {
      throw new Error('Generated model-request audit is not ready');
    }
  });
  await dialog.locator('[data-testid="prompt-preview-model-request-detail"]').click();
  await retry(async () => {
    if (await dialog.locator('[data-testid="prompt-preview-audit-detail"] pre').count() !== 1) {
      throw new Error('Generated model-request detail is not ready');
    }
  });
});

Then(
  'the generated prompt should contain all repeated compaction summaries and the recent conversation tail',
  async function(this: ApplicationWorld) {
    const page = currentPage(this);
    const state = fixture(this);
    const dialog = page.getByRole('dialog');
    const detail = dialog.locator('[data-testid="prompt-preview-audit-detail"]');
    let requestJson = '';
    let previousChunk = '';
    for (let chunkIndex = 0; chunkIndex < 128; chunkIndex++) {
      const chunk = await detail.locator('pre').textContent() ?? '';
      if (chunk.length === 0) throw new Error('Prompt audit returned an empty request chunk');
      requestJson += chunk;
      const next = detail.locator('[data-testid="prompt-preview-audit-detail-next"]');
      if (await next.count() === 0) break;
      previousChunk = chunk;
      await next.click();
      await retry(async () => {
        const nextChunk = await detail.locator('pre').textContent() ?? '';
        if (nextChunk.length === 0 || nextChunk === previousChunk) {
          throw new Error('Prompt audit has not advanced to its next bounded chunk');
        }
      });
      if (chunkIndex === 127) throw new Error('Prompt audit exceeded its bounded 128-chunk E2E ceiling');
    }

    const summaryPresence = Array.from(
      { length: state.compactionCount },
      (_, index) => requestJson.includes(`E2E durable compaction summary ${index + 1}`),
    );
    for (let index = 1; index <= state.compactionCount; index++) {
      if (!summaryPresence[index - 1]) {
        const visibleFixtureFragments = requestJson.match(/E2E (?:durable compaction summary|long (?:question|answer)) \\?\d+/gu) ?? [];
        throw new Error(
          `Generated prompt omitted durable compaction summary ${index}: ${
            JSON.stringify({
              summaryPresence,
              requestCodeUnits: requestJson.length,
              visibleFixtureFragments: [...new Set(visibleFixtureFragments)].slice(0, 16),
            })
          }`,
        );
      }
    }
    const lastNumber = (state.turnCount - 1).toString().padStart(5, '0');
    for (const expected of [`E2E long question ${lastNumber}`, `E2E long answer ${lastNumber}`]) {
      if (!requestJson.includes(expected)) throw new Error(`Generated prompt omitted recent history: ${expected}`);
    }
  },
);
