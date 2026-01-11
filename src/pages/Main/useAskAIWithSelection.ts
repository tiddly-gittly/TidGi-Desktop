import { IAskAIWithSelectionData } from '@/constants/channels';
import { PageType } from '@/constants/pageTypes';
import { useTabStore } from '@/pages/Agent/store/tabStore';
import { IChatTab, IWikiEmbedTab, TabState, TabType } from '@/pages/Agent/types/tab';
import { nanoid } from 'nanoid';
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

        // Create child tab objects without adding them to the database
        // These will only exist as part of the split view
        const timestamp = Date.now();

        const childTabs = [];

        // Create a Chat tab object with the selected text as initial message (LEFT pane)
        // We need to create an agent instance first for the chat tab
        // Use the specified agent definition or default if not provided
        const agent = await window.service.agentInstance.createAgent(data.agentDefId);
        const chatTab: IChatTab = {
          id: nanoid(),
          type: TabType.CHAT,
          title: agent.name || 'AI Chat',
          agentDefId: agent.agentDefId,
          agentId: agent.id,
          initialMessage: data.selectionText,
          state: TabState.ACTIVE,
          isPinned: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        childTabs.push(chatTab);

        // Create a Wiki Embed tab object for the RIGHT pane (if workspaceId is provided)
        // Put wiki on the right to avoid its BrowserView covering tab context menus
        if (data.workspaceId) {
          // Get the actual workspace to ensure we have the correct ID (case-sensitive)
          const workspace = await window.service.workspace.get(data.workspaceId);
          if (workspace) {
            const wikiEmbedTab: IWikiEmbedTab = {
              id: nanoid(),
              type: TabType.WIKI_EMBED,
              title: workspace.name || 'Wiki',
              workspaceId: workspace.id, // Use the canonical ID from the workspace object
              state: TabState.ACTIVE,
              isPinned: false,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
            childTabs.push(wikiEmbedTab);
          }
        }

        // Send the initial message to the agent immediately (no need for setTimeout)
        if (data.selectionText && agent.id) {
          void window.service.agentInstance.sendMsgToAgent(agent.id, { text: data.selectionText });
        }

        // Create a split view tab with the child tabs
        const splitViewTab = await addTab(TabType.SPLIT_VIEW, {
          childTabs,
          splitRatio: 50,
        });
        setActiveTab(splitViewTab.id);
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
