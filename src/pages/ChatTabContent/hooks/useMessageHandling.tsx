// Message handling hook for chat component
import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore';
import { KeyboardEvent, useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

interface UseMessageHandlingProps {
  agentId: string | undefined;
  isUserAtBottom: () => boolean;
  isUserAtBottomReference: React.RefObject<boolean>;
  debouncedScrollToBottom: () => void;
}

export interface WikiTiddlerAttachment {
  workspaceName: string;
  tiddlerTitle: string;
}

/**
 * Custom hook for handling message operations in chat interfaces
 * Directly uses the agent store to reduce prop drilling and potential bugs
 */
export function useMessageHandling({
  agentId,
  isUserAtBottom,
  isUserAtBottomReference,
  debouncedScrollToBottom,
}: UseMessageHandlingProps) {
  // Get agent and sendMessage function directly from the store using useShallow
  // to prevent unnecessary re-renders
  const { sendMessage, agent } = useAgentChatStore(
    useShallow((state) => ({
      sendMessage: state.sendMessage,
      agent: state.agent,
    })),
  );
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | undefined>();
  const [selectedWikiTiddlers, setSelectedWikiTiddlers] = useState<WikiTiddlerAttachment[]>([]);
  const [parametersOpen, setParametersOpen] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

  /**
   * Handle opening parameter dialog
   */
  const handleOpenParameters = useCallback(() => {
    setParametersOpen(true);
  }, []);

  /**
   * Handle message input changes
   */
  const handleMessageChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(event.target.value);
  }, []);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
  }, []);

  /**
   * Handle clearing selected file
   */
  const handleClearFile = useCallback(() => {
    setSelectedFile(undefined);
  }, []);

  /**
   * Handle wiki tiddler selection
   */
  const handleWikiTiddlerSelect = useCallback((tiddler: WikiTiddlerAttachment) => {
    setSelectedWikiTiddlers(prev => [...prev, tiddler]);
  }, []);

  /**
   * Handle removing a wiki tiddler attachment
   */
  const handleRemoveWikiTiddler = useCallback((index: number) => {
    setSelectedWikiTiddlers(prev => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Handle sending a message
   */
  const handleSendMessage = useCallback(async () => {
    if ((!message.trim() && !selectedFile && selectedWikiTiddlers.length === 0) || !agent || sendingMessage || !agentId) return;

    // Store the current scroll position status before sending message
    const wasAtBottom = isUserAtBottom();
    setSendingMessage(true);

    try {
      await sendMessage(message, selectedFile, selectedWikiTiddlers);
      setMessage('');
      // After sending, update the scroll position reference to ensure proper scrolling
      isUserAtBottomReference.current = wasAtBottom;

      // If user was at bottom when sending message, scroll to bottom with debounce
      if (wasAtBottom) {
        debouncedScrollToBottom();
      }
    } finally {
      // Always clear selections, even if send fails
      setSelectedFile(undefined);
      setSelectedWikiTiddlers([]);
      setSendingMessage(false);
    }
  }, [message, selectedFile, selectedWikiTiddlers, agent, sendingMessage, agentId, isUserAtBottom, sendMessage, debouncedScrollToBottom, isUserAtBottomReference]);

  /**
   * Handle keyboard events for sending messages
   */
  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  return {
    message,
    parametersOpen,
    sendingMessage,
    setParametersOpen,
    handleOpenParameters,
    handleMessageChange,
    handleSendMessage,
    handleKeyPress,
    selectedFile,
    handleFileSelect,
    handleClearFile,
    selectedWikiTiddlers,
    handleWikiTiddlerSelect,
    handleRemoveWikiTiddler,
  };
}
