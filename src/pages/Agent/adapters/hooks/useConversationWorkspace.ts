import { CHAT_WIKI_REFRESH_INTERVAL_MS } from '@/constants/agent';
import { WikiChannel } from '@/constants/channels';
import { isWikiWorkspace, type IWikiWorkspace } from '@/services/workspaces/interface';
import { isFolderWikiWorkspace } from '@/services/workspaces/workspacePaths';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auditTime } from 'rxjs';

export function useConversationWorkspace(conversationId: string) {
  const [selection, setSelection] = useState<{ conversationId: string; workspaceId: string | null }>();
  const [activeWikiId, setActiveWikiId] = useState<string>();
  const [workspaces, setWorkspaces] = useState<IWikiWorkspace[]>([]);
  const [wikiRevision, setWikiRevision] = useState(0);
  const generation = useRef(0);
  const selectionQueue = useRef(Promise.resolve());
  const selectionRevision = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    let refreshRevision = 0;
    async function refreshWorkspaces() {
      const revision = ++refreshRevision;
      const [available, activeWiki] = await Promise.all([
        window.service.workspace.getWorkspacesAsList(),
        window.service.workspaceView.getActiveWikiWorkspaceId(),
      ]);
      if (generation.current !== current || revision !== refreshRevision) return;
      setWorkspaces(available.filter(isWikiWorkspace).filter(workspace => !workspace.isSubWiki));
      setActiveWikiId(activeWiki);
    }
    const load = async () => {
      const [saved] = await Promise.all([
        window.service.agentInstance.getConversationWorkspace(conversationId),
        refreshWorkspaces(),
      ]);
      if (generation.current !== current) return;
      setSelection({ conversationId, workspaceId: saved });
    };
    void load().catch((error: unknown) => {
      if (generation.current === current) setSelection({ conversationId, workspaceId: null });
      void window.service.native.log('error', 'Failed to load conversation workspace', { error });
    });
    const subscription = window.observables.workspace.workspaces$.subscribe(value => {
      if (value && generation.current === current) {
        void refreshWorkspaces().catch((error: unknown) => {
          void window.service.native.log('warn', 'Failed to refresh conversation workspaces', { error });
        });
      }
    });
    return () => {
      generation.current += 1;
      subscription.unsubscribe();
    };
  }, [conversationId]);

  const select = useCallback(async (next: string | null) => {
    const current = generation.current;
    const revision = ++selectionRevision.current;
    const write = selectionQueue.current.then(async () => {
      await window.service.agentInstance.setConversationWorkspace(conversationId, next);
      if (generation.current === current && selectionRevision.current === revision) setSelection({ conversationId, workspaceId: next });
    });
    selectionQueue.current = write.catch((error: unknown) => {
      void window.service.native.log('warn', 'Conversation workspace selection was not saved', { error });
    });
    await write;
  }, [conversationId]);
  const loading = selection?.conversationId !== conversationId;
  const workspaceId = loading ? null : selection.workspaceId;
  const selectedWorkspace = loading ? undefined : workspaces.find(workspace => workspace.id === (workspaceId ?? activeWikiId));
  const renderWorkspaceId = selectedWorkspace && isFolderWikiWorkspace(selectedWorkspace) && !selectedWorkspace.hibernated
    ? selectedWorkspace.id
    : undefined;
  useEffect(() => {
    if (!renderWorkspaceId) return;
    const subscription = window.observables.wiki.getWikiChangeObserver$(renderWorkspaceId).pipe(auditTime(CHAT_WIKI_REFRESH_INTERVAL_MS)).subscribe({
      next: () => {
        setWikiRevision(revision => revision + 1);
      },
      error: (error: unknown) => {
        void window.service.native.log('warn', 'Chat wiki change subscription ended', { error });
      },
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [renderWorkspaceId]);

  const renderHtml = useMemo(() => {
    if (!renderWorkspaceId) return undefined;
    return async (text: string, signal: AbortSignal) => {
      signal.throwIfAborted();
      const rendered = await window.service.wiki.wikiOperationInServer(WikiChannel.renderWikiText, renderWorkspaceId, [text]);
      signal.throwIfAborted();
      return rendered;
    };
  }, [renderWorkspaceId]);
  return { workspaceId, workspaces, loading, select, renderWorkspaceId, renderHtml, wikiRevision };
}
