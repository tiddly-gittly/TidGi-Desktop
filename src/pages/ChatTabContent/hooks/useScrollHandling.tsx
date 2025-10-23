// Scroll handling hook for chat component
import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Custom hook for managing scroll behavior in chat interfaces
 * Handles auto-scrolling, detecting user scroll position, and smooth scrolling
 */
export function useScrollHandling() {
  const isUserAtBottomReference = useRef(true); // Keep track of user's scroll position
  const initialScrollDoneReference = useRef<Record<string, boolean>>({}); // Track initial scroll for each agent

  /**
   * Scroll to the bottom of the messages container
   */
  const scrollToBottom = useCallback(() => {
    const messagesContainer = document.getElementById('messages-container');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, []);

  /**
   * Debounced version of scrollToBottom to prevent UI jumping during content streaming
   */
  const debouncedScrollToBottom = useDebouncedCallback(
    scrollToBottom, // The function to debounce
    [], // Dependencies array for the callback
    250, // Delay in ms before executing the function
  );

  /**
   * Check if the user is at the bottom of the scroll container
   */
  const isUserAtBottom = useCallback(() => {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return true;

    const threshold = 100; // Consider "at bottom" if within 100px of the bottom
    const position = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight;

    return position < threshold;
  }, []);

  // Setup listener to track user's scroll position
  useEffect(() => {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;

    const handleScroll = () => {
      // Update the ref whenever user scrolls
      isUserAtBottomReference.current = isUserAtBottom();
    };

    messagesContainer.addEventListener('scroll', handleScroll);

    // Initial check
    isUserAtBottomReference.current = isUserAtBottom();

    return () => {
      messagesContainer.removeEventListener('scroll', handleScroll);
    };
  }, [isUserAtBottom]);

  /**
   * Check if initial scroll has been done for a given agent
   */
  const hasInitialScrollBeenDone = (agentId: string): boolean => {
    return initialScrollDoneReference.current[agentId] ?? false;
  };

  /**
   * Mark initial scroll as done for a given agent
   */
  const markInitialScrollAsDone = (agentId: string): void => {
    initialScrollDoneReference.current[agentId] = true;
  };

  return {
    isUserAtBottomReference,
    scrollToBottom,
    debouncedScrollToBottom,
    isUserAtBottom,
    hasInitialScrollBeenDone,
    markInitialScrollAsDone,
  };
}
