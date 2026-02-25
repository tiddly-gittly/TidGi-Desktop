/**
 * Virtualized Messages Container
 *
 * Uses react-window v2 List for efficient rendering of long conversations.
 * Messages are loaded by ID — content is fetched from store only when the row is rendered.
 * For short conversations (< VIRTUALIZATION_THRESHOLD), falls back to simple DOM rendering.
 */
import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { CSSProperties, ReactElement, ReactNode, useCallback, useEffect } from 'react';
import { List, useListRef } from 'react-window';
import { MessageBubble } from './MessageBubble';

/** Threshold: virtualize when message count exceeds this */
const VIRTUALIZATION_THRESHOLD = 50;
/** Default estimated row height for initial render */
const DEFAULT_ROW_HEIGHT = 100;

const Container = styled(Box)`
  flex: 1;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background-color: ${props => props.theme.palette.background.default};
`;

const SimpleContainer = styled(Box)`
  flex: 1;
  height: 100%;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background-color: ${props => props.theme.palette.background.default};
`;

interface MessagesContainerProps {
  messageIds: string[];
  children?: ReactNode;
  isSplitView?: boolean;
}

interface RowProps {
  messageIds: string[];
  isSplitView?: boolean;
}

/**
 * Row renderer for the virtualized list.
 * Each row renders a MessageBubble by ID (content is fetched from zustand store inside MessageBubble).
 */
function VirtualizedRow({ index, style, messageIds, isSplitView }: {
  ariaAttributes: Record<string, unknown>;
  index: number;
  style: CSSProperties;
} & RowProps): ReactElement {
  const messageId = messageIds[index];
  return (
    <div style={{ ...style, paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
      <MessageBubble
        messageId={messageId}
        isSplitView={isSplitView}
      />
    </div>
  );
}

/**
 * Container component for all chat messages.
 * Uses virtualization for long conversations, simple DOM rendering for short ones.
 * The `id='messages-container'` is preserved for scroll handling compatibility.
 */
export const MessagesContainer: React.FC<MessagesContainerProps> = ({ messageIds, children, isSplitView }) => {
  const listRef = useListRef(null);

  // Track measured row heights for the virtual list
  const rowHeightsMap = React.useRef<Map<number, number>>(new Map());

  const getItemSize = useCallback((index: number) => {
    return rowHeightsMap.current.get(index) ?? DEFAULT_ROW_HEIGHT;
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current && messageIds.length > VIRTUALIZATION_THRESHOLD) {
      listRef.current.scrollToRow({ index: messageIds.length - 1, align: 'end' });
    }
  }, [messageIds.length, listRef]);

  // Use simple rendering for short conversations
  if (messageIds.length <= VIRTUALIZATION_THRESHOLD) {
    return (
      <SimpleContainer id='messages-container'>
        {messageIds.map((messageId) => (
          <MessageBubble
            key={messageId}
            messageId={messageId}
            isSplitView={isSplitView}
          />
        ))}
        {children}
      </SimpleContainer>
    );
  }

  // Virtualized rendering for long conversations
  return (
    <Container id='messages-container'>
      <List<RowProps>
        listRef={listRef}
        defaultHeight={600}
        rowComponent={VirtualizedRow}
        rowCount={messageIds.length}
        rowHeight={getItemSize}
        rowProps={{ messageIds, isSplitView }}
        overscanCount={5}
      />
      {children}
    </Container>
  );
};
