import { WikiChannel } from '@/constants/channels';
import { isWikiWorkspace, type IWikiWorkspace } from '@/services/workspaces/interface';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useConversationWorkspace(conversationId: string) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<IWikiWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const selectionQueue = useRef(Promise.resolve());
  const selectionRevision = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    const load = async () => {
      const [saved, available] = await Promise.all([
        window.service.agentInstance.getConversationWorkspace(conversationId),
        window.service.workspace.getWorkspacesAsList(),
      ]);
      if (generation.current !== current) return;
      setWorkspaceId(saved);
      setWorkspaces(available.filter(isWikiWorkspace).filter(workspace => !workspace.isSubWiki));
      setLoading(false);
    };
    void load().catch((error: unknown) => {
      if (generation.current === current) setLoading(false);
      void window.service.native.log('error', 'Failed to load conversation workspace', { error });
    });
    const subscription = window.observables.workspace.workspaces$.subscribe(value => {
      if (value && generation.current === current) {
        void window.service.workspace.getWorkspacesAsList().then(available => {
          if (generation.current === current) setWorkspaces(available.filter(isWikiWorkspace).filter(workspace => !workspace.isSubWiki));
        }).catch((error: unknown) => {
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
      if (generation.current === current && selectionRevision.current === revision) setWorkspaceId(next);
    });
    selectionQueue.current = write.catch((error: unknown) => {
      void window.service.native.log('warn', 'Conversation workspace selection was not saved', { error });
    });
    await write;
  }, [conversationId]);
  const renderHtml = useCallback(async (text: string, signal: AbortSignal): Promise<string | undefined> => {
    signal.throwIfAborted();
    const selected = workspaceId ?? (await window.service.workspace.getActiveWorkspace())?.id;
    if (!selected) return undefined;
    const workspace = await window.service.workspace.get(selected);
    if (!workspace || !isWikiWorkspace(workspace) || workspace.hibernated) return undefined;
    const workers = await window.service.wiki.getWorkersInfo();
    signal.throwIfAborted();
    if (!workers.some(worker => worker.workspaceID === selected && worker.isRunning)) return undefined;
    const rendered = await window.service.wiki.wikiOperationInServer(WikiChannel.renderWikiText, selected, [text]);
    signal.throwIfAborted();
    return rendered;
  }, [workspaceId, workspaces]);
  return { workspaceId, workspaces, loading, select, renderHtml };
}
