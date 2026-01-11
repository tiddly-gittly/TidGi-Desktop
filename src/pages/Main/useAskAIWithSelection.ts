import { IAskAIWithSelectionData } from '@/constants/channels';
import { PageType } from '@/constants/pageTypes';
import { useTabStore } from '@/pages/Agent/store/tabStore';
import { TabType } from '@/pages/Agent/types/tab';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

/**
 * Hook to handle "Ask AI with selection" from wiki context menu.
 * When triggered, navigates to Agent page and creates a split view with:
 * - Left pane: Embedded Wiki BrowserView (using WIKI_EMBED tab type)
 * - Right pane: Chat tab with the selected text as initial message
 */
export function useAskAIWithSelection(): void {
  const [, setLocation] = useLocation();
  const tabStore = useTabStore();
  // Use refs to avoid recreating the callback when store functions change
  const tabStoreReference = useRef(tabStore);
  tabStoreReference.current = tabStore;
  const setLocationReference = useRef(setLocation);
  setLocationReference.current = setLocation;

  // Use a ref to track if we're currently processing to prevent double-triggers
  const isProcessingReference = useRef(false);

  const handleAskAIWithSelection = useCallback(
    async (_event: Electron.IpcRendererEvent, data: IAskAIWithSelectionData) => {
      // Prevent double processing
      if (isProcessingReference.current) {
        void window.service.native.log('debug', 'askAIWithSelection already processing, skipping');
        return;
      }
      isProcessingReference.current = true;

      try {
        void window.service.native.log('debug', 'askAIWithSelection triggered', { data: JSON.stringify(data) });

        // Find the Agent workspace and activate it
        const workspaces = await window.service.workspace.getWorkspacesAsList();
        const agentWorkspace = workspaces.find(ws => ws.pageType === PageType.agent);

        if (agentWorkspace) {
          // Navigate to Agent page URL
          setLocationReference.current(`/${PageType.agent}`);
          // Activate the Agent workspace view (this hides wiki BrowserView and shows Agent page)
          await window.service.workspaceView.setActiveWorkspaceView(agentWorkspace.id);
        } else {
          void window.service.native.log('warn', 'Agent workspace not found');
          return;
        }

        // Small delay to ensure navigation completes
        await new Promise(resolve => setTimeout(resolve, 100));

        const { addTab, setActiveTab } = tabStoreReference.current;

        // Create a Wiki Embed tab for the left pane (if workspaceId is provided)
        let wikiEmbedTab;
        if (data.workspaceId) {
          wikiEmbedTab = await addTab(TabType.WIKI_EMBED, {
            workspaceId: data.workspaceId,
            title: 'Wiki',
          });
        }

        // Create a Chat tab with the selected text as initial message
        const chatTab = await addTab(TabType.CHAT, {
          initialMessage: data.selectionText,
        });

        // If we have both tabs, create a split view
        if (wikiEmbedTab && chatTab) {
          const splitViewTab = await addTab(TabType.SPLIT_VIEW, {
            childTabs: [wikiEmbedTab, chatTab],
            splitRatio: 50,
          });
          setActiveTab(splitViewTab.id);
        } else if (chatTab) {
          // Just activate the chat tab if no wiki embed tab
          setActiveTab(chatTab.id);
        }
      } catch (error) {
        void window.service.native.log('error', 'Failed to handle askAIWithSelection', { error: String(error) });
      } finally {
        isProcessingReference.current = false;
      }
    },
    [], // Empty deps - we use refs to access current values
  );

  useEffect(() => {
    window.remote.registerAskAIWithSelection(handleAskAIWithSelection);
    return () => {
      window.remote.unregisterAskAIWithSelection(handleAskAIWithSelection);
    };
  }, [handleAskAIWithSelection]);
}
