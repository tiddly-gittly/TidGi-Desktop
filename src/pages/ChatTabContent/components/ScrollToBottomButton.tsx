// ScrollToBottomButton component to scroll chat to the bottom when clicked

import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { Box, Fab, Zoom } from '@mui/material';
import React, { useEffect, useState } from 'react';

interface ScrollToBottomButtonProps {
  scrollToBottom: () => void;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({ scrollToBottom }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Function to check if user has scrolled away from the bottom
    const handleScroll = () => {
      const messagesContainer = document.getElementById('messages-container');
      if (!messagesContainer) return;

      const threshold = 100; // Consider "at bottom" if within 100px of the bottom
      const position = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight;
      setIsVisible(position >= threshold);
    };

    // Add scroll event listener
    const messagesContainer = document.getElementById('messages-container');
    if (messagesContainer) {
      messagesContainer.addEventListener('scroll', handleScroll);
    }

    // Check initial state
    handleScroll();

    // Clean up the event listener
    return () => {
      if (messagesContainer) {
        messagesContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  return (
    <Zoom in={isVisible}>
      <Box
        sx={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          zIndex: 1000,
        }}
      >
        <Fab
          color='primary'
          size='small'
          onClick={() => {
            scrollToBottom();
          }}
          aria-label='scroll to bottom'
        >
          <ArrowDownwardIcon />
        </Fab>
      </Box>
    </Zoom>
  );
};
