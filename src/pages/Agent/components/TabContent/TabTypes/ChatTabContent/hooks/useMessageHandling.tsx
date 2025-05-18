// Message handling hook for chat component
import { KeyboardEvent, useCallback, useState } from 'react';
import { AgentWithoutMessages } from '../../../../../store/agentChatStore';

interface UseMessageHandlingProps {
  agentId: string | undefined;
  sendMessage: (agentId: string, message: string) => Promise<void>;
  isUserAtBottom: () => boolean;
  isUserAtBottomReference: React.RefObject<boolean>;
  debouncedScrollToBottom: () => void;
  agent: AgentWithoutMessages | null; // Updated to use AgentWithoutMessages type
}

/**
 * Custom hook for handling message operations in chat interfaces
 */
export function useMessageHandling({
  agentId,
  sendMessage,
  isUserAtBottom,
  isUserAtBottomReference,
  debouncedScrollToBottom,
  agent,
}: UseMessageHandlingProps) {
  const [message, setMessage] = useState('');
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
   * Handle sending a message
   */
  const handleSendMessage = useCallback(async () => {
    if (!message.trim() || !agent || sendingMessage || !agentId) return;

    // Store the current scroll position status before sending message
    const wasAtBottom = isUserAtBottom();
    setSendingMessage(true);

    try {
      await sendMessage(agentId, message);
      setMessage('');
      // After sending, update the scroll position reference to ensure proper scrolling
      isUserAtBottomReference.current = wasAtBottom;

      // If user was at bottom when sending message, scroll to bottom with debounce
      if (wasAtBottom) {
        debouncedScrollToBottom();
      }
    } finally {
      setSendingMessage(false);
    }
  }, [message, agent, sendingMessage, agentId, isUserAtBottom, sendMessage, debouncedScrollToBottom, isUserAtBottomReference]);

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
  };
}
