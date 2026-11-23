import { Given } from '@cucumber/cucumber';
import { validateConversationTimelineResult } from '@memeloop/react-ui/chat/core';
import assert from 'node:assert/strict';
import type { ApplicationWorld } from './application';

Given('I seed the active packaged agent with {int} long-conversation turns and repeated compactions', async function(this: ApplicationWorld, turnCount: number) {
  assert(this.currentWindow);
  const result = await this.currentWindow.evaluate(async requestedTurnCount => {
    const agents = await window.service.agentInstance.getAgents(1, 20, { closed: false });
    if (agents.length !== 1) throw new Error(`Expected one conversation before seeding, received ${agents.length}`);
    return window.service.agentInstance.seedLongConversationForE2E({ conversationId: agents[0].id, turnCount: requestedTurnCount });
  }, turnCount);
  assert.equal(result.turnCount, turnCount);
  assert.equal(result.messageCount, turnCount * 2);
  assert(result.compactionCount >= 2, 'The fixture must retain repeated compactions');

  // Verify the durable fixture through the same paged service used by the renderer.
  // UI navigation and residency assertions are separate steps in the feature.
  const pages = await this.currentWindow.evaluate(async conversationId => {
    const options = { limit: 50, maxBytes: 256 * 1024 };
    return {
      tail: await window.service.agentInstance.getAgentConversationTimelinePage(conversationId, options),
      first: await window.service.agentInstance.getAgentConversationTimelinePage(conversationId, { ...options, aroundEntryIndex: 0 }),
    };
  }, result.conversationId);
  for (const page of [pages.tail, pages.first]) {
    assert(!page.reset, 'Seeded timeline must not reset');
    assert(page.items.length > 0 && page.items.length <= 50, 'Host timeline must respect its page bound');
    assert.equal(page.totalEntries, result.messageCount + result.compactionCount);
    validateConversationTimelineResult(page, result.conversationId);
  }
  assert(!pages.first.reset, 'The first timeline page must be available');
  const first = pages.first.items[0];
  assert.equal(first.entryIndex, 0);
  assert(first.kind === 'message' && first.turnId.endsWith(':00000'), 'Absolute entry zero must identify the first durable turn');
});
