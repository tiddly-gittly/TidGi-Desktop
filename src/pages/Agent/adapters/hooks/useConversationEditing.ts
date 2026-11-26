import { useTabStore } from '@/pages/Agent/store/tabStore';
import type { IChatTab } from '@/pages/Agent/types/tab';
import type { ConversationBranchState, ConversationEditingAdapter, ConversationMessageListProjection, ConversationTimelinePageSuccess } from 'memeloop';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createSecureBrowserUuid } from '../createSecureBrowserUuid';

const emptyBranches: ConversationBranchState[] = [];

export function useConversationEditing(
  tab: IChatTab & { agentId: string },
  messages: readonly ConversationMessageListProjection[],
  timeline?: ConversationTimelinePageSuccess,
  revision?: string,
  isRunning = false,
): ConversationEditingAdapter {
  const [loaded, setLoaded] = useState<{ conversationId: string; branches: ConversationBranchState[] }>();
  const branches = loaded?.conversationId === tab.agentId ? loaded.branches : emptyBranches;
  const attempts = useRef<{ key: string; requestId: string; targetConversationId: string } | undefined>(undefined);
  const identitiesKey = JSON.stringify([
    ...new Set([
      ...messages.filter(message => message.role === 'user').map(message => message.messageId),
      ...(timeline?.items.flatMap(entry => entry.kind === 'message' && entry.role === 'user' ? [entry.messageId] : []) ?? []),
    ]),
  ]);
  useEffect(() => {
    let disposed = false;
    let request = 0;
    const identities = JSON.parse(identitiesKey) as string[];
    const refresh = async () => {
      const currentRequest = ++request;
      const result: ConversationBranchState[] = [];
      for (let offset = 0; offset < identities.length; offset += 256) {
        const page = await window.service.agentInstance.getConversationBranches(tab.agentId, identities.slice(offset, offset + 256));
        if (disposed || currentRequest !== request) return;
        result.push(...page);
      }
      if (!disposed) setLoaded({ conversationId: tab.agentId, branches: result });
    };
    const reload = () => {
      void refresh().catch((error: unknown) => {
        void window.service.native.log('error', 'Failed to load conversation branches', { error });
      });
    };
    reload();
    window.addEventListener('focus', reload);
    return () => {
      disposed = true;
      window.removeEventListener('focus', reload);
    };
  }, [identitiesKey, revision, isRunning, tab.agentId, tab.state]);

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
