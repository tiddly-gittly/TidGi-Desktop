import { useTabStore } from '@/pages/Agent/store/tabStore';
import type { IChatTab } from '@/pages/Agent/types/tab';
import type { ConversationBranchState, ConversationEditingAdapter, ConversationMessageListProjection, ConversationTimelinePageSuccess } from 'memeloop';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createSecureBrowserUuid } from '../createSecureBrowserUuid';

export function useConversationEditing(
  tab: IChatTab & { agentId: string },
  messages: readonly ConversationMessageListProjection[],
  timeline?: ConversationTimelinePageSuccess,
): ConversationEditingAdapter {
  const [branches, setBranches] = useState<ConversationBranchState[]>([]);
  const attempts = useRef<{ key: string; requestId: string; targetConversationId: string } | undefined>(undefined);
  const identities = useMemo(() => [
    ...new Set([
      ...messages.filter(message => message.role === 'user').map(message => message.messageId),
      ...(timeline?.items.flatMap(entry => entry.kind === 'message' && entry.role === 'user' ? [entry.messageId] : []) ?? []),
    ]),
  ], [messages, timeline]);
  useEffect(() => {
    let disposed = false;
    setBranches([]);
    void (async () => {
      const result: ConversationBranchState[] = [];
      for (let offset = 0; offset < identities.length; offset += 256) {
        const page = await window.service.agentInstance.getConversationBranches(tab.agentId, identities.slice(offset, offset + 256));
        if (disposed) return;
        result.push(...page);
      }
      if (!disposed) setBranches(result);
    })().catch((error: unknown) => {
      void window.service.native.log('error', 'Failed to load conversation branches', { error });
    });
    return () => {
      disposed = true;
    };
  }, [identities, tab.agentId]);

  return useMemo(() => ({
    branches,
    loadSource: messageId => window.service.agentInstance.loadConversationEditSource(tab.agentId, messageId),
    saveDraft: (messageId, text, expectedRevision) =>
      window.service.agentInstance.saveConversationEditDraft({
        conversationId: tab.agentId,
        messageId,
        text,
        expectedRevision,
      }),
    submit: async (messageId, text, sourceRevision, draftRevision) => {
      const key = JSON.stringify([tab.agentId, messageId, sourceRevision, text]);
      let attempt = attempts.current;
      if (attempt?.key !== key) {
        attempt = { key, requestId: createSecureBrowserUuid(), targetConversationId: createSecureBrowserUuid() };
        attempts.current = attempt;
      }
      await window.service.agentInstance.forkConversation({
        conversationId: tab.agentId,
        messageId,
        sourceRevision,
        text,
        requestId: attempt.requestId,
        targetConversationId: attempt.targetConversationId,
        replacementMessageId: `initial:${tab.id}:${attempt.targetConversationId}:turn`,
        navigation: { tabId: tab.id, draftRevision },
      });
      useTabStore.setState({ tabs: await window.service.agentBrowser.getAllTabs() });
    },
    switchBranch: async (conversationId, _messageId) => {
      const agent = await window.service.agentInstance.getAgentMetadata(conversationId);
      if (!agent) throw new Error('conversation_branch_not_available');
      await window.service.agentBrowser.updateTab(tab.id, {
        agentId: conversationId,
        agentDefId: agent.agentDefId,
        initialMessage: undefined,
        initialWikiTiddlers: undefined,
        initialEditSource: undefined,
      });
      useTabStore.setState({ tabs: await window.service.agentBrowser.getAllTabs() });
    },
  }), [branches, tab.agentId, tab.id]);
}
