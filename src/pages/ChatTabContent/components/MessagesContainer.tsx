/**
 * Messages Container
 *
 * Groups messages into turns (user message + subsequent agent responses).
 * Each turn renders a TurnActionBar at the bottom (visible on hover).
 * For short conversations (<= VIRTUALIZATION_THRESHOLD), renders simple DOM.
 * For long conversations, uses react-window v2 List for virtualization.
 */
import { Box, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { styled } from '@mui/material/styles';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CopyAllIcon from '@mui/icons-material/CopyAll';
import type { AgentInstanceMessage } from '@services/agentInstance/interface';
import React, { CSSProperties, ReactElement, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { List, useListRef } from 'react-window';
import { useAgentChatStore } from '../../Agent/store/agentChatStore/index';
import { stripToolXml } from './MessageRenderer/BaseMessageRenderer';
import { MessageBubble } from './MessageBubble';
import { TurnActionBar } from './TurnActionBar';

/** Threshold: virtualize when message count exceeds this */
const VIRTUALIZATION_THRESHOLD = 50;
/** Default estimated row height for initial render */
const DEFAULT_ROW_HEIGHT = 100;

/** A turn = one user message + all subsequent non-user messages */
interface Turn {
  userMessageId: string;
  messageIds: string[];
}

/** Derive turns from ordered message IDs */
function buildTurns(orderedIds: string[], messages: Map<string, AgentInstanceMessage>): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | undefined;

  for (const id of orderedIds) {
    const message = messages.get(id);
    if (!message) continue;
    if (message.role === 'user') {
      current = { userMessageId: id, messageIds: [id] };
      turns.push(current);
    } else if (current) {
      current.messageIds.push(id);
    } else {
      // Agent message without a preceding user message (e.g. system welcome) — treat as standalone turn
      turns.push({ userMessageId: id, messageIds: [id] });
    }
  }
  return turns;
}

const SimpleContainer = styled(Box)`
  flex: 1;
  height: 100%;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: ${props => props.theme.palette.background.default};
`;

const Container = styled(Box)`
  flex: 1;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background-color: ${props => props.theme.palette.background.default};
`;

const TurnWrapper = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

interface MessagesContainerProps {
  messageIds: string[];
  children?: ReactNode;
  isSplitView?: boolean;
  /** Called when a turn is deleted so the input can be pre-filled with the user text */
  onDeleteTurn?: (userText: string) => void;
}

interface RowProps {
  turns: Turn[];
  isSplitView?: boolean;
  onDeleteTurn?: (userText: string) => void;
}

/** Single turn renderer for the simple (non-virtualized) path */
const TurnGroup: React.FC<{ turn: Turn; isSplitView?: boolean; onDeleteTurn?: (userText: string) => void; onContextMenu?: (event: React.MouseEvent, turnMessageIds: string[]) => void }> = ({
  turn,
  isSplitView,
  onDeleteTurn,
  onContextMenu,
}) => {
  const hasAgentMessages = turn.messageIds.length > 1 || turn.messageIds[0] !== turn.userMessageId;
  return (
    <TurnWrapper
      className='turn-group'
      onContextMenu={(event) => {
        onContextMenu?.(event, turn.messageIds);
      }}
    >
      {turn.messageIds.map((messageId) => (
        <MessageBubble
          key={messageId}
          messageId={messageId}
          isSplitView={isSplitView}
        />
      ))}
      {hasAgentMessages && (
        <TurnActionBar
          userMessageId={turn.userMessageId}
          turnMessageIds={turn.messageIds}
          onDeleteTurn={onDeleteTurn}
        />
      )}
    </TurnWrapper>
  );
};

/**
 * Row renderer for the virtualized list — renders one turn per row.
 */
function VirtualizedRow({ index, style, turns, isSplitView, onDeleteTurn }: {
  ariaAttributes: Record<string, unknown>;
  index: number;
  style: CSSProperties;
} & RowProps): ReactElement {
  const turn = turns[index];
  return (
    <div style={{ ...style, paddingLeft: 16, paddingRight: 16, paddingBottom: 8 }}>
      <TurnGroup turn={turn} isSplitView={isSplitView} onDeleteTurn={onDeleteTurn} />
    </div>
  );
}

/**
 * Container component for all chat messages grouped by turn.
 */
export const MessagesContainer: React.FC<MessagesContainerProps> = ({ messageIds, children, isSplitView, onDeleteTurn }) => {
  const listRef = useListRef(null);
  const messages = useAgentChatStore(state => state.messages);

  const turns = useMemo(() => buildTurns(messageIds, messages), [messageIds, messages]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; turnMessageIds: string[] } | null>(null);

  const handleContextMenu = useCallback((event: React.MouseEvent, turnMessageIds: string[]) => {
    event.preventDefault();
    setContextMenu({ mouseX: event.clientX, mouseY: event.clientY, turnMessageIds });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleCopy = useCallback(() => {
    if (!contextMenu) return;
    const text = contextMenu.turnMessageIds
      .map(id => {
        const message = messages.get(id);
        if (!message) return '';
        return stripToolXml(message.content) || '';
      })
      .filter(Boolean)
      .join('\n\n');
    if (text) void navigator.clipboard.writeText(text);
    setContextMenu(null);
  }, [contextMenu, messages]);

  const handleCopyAll = useCallback(() => {
    const allText = messageIds
      .map(id => {
        const message = messages.get(id);
        if (!message) return '';
        const role = message.role === 'user' ? 'User' : 'Agent';
        const content = stripToolXml(message.content) || '';
        return content ? `${role}: ${content}` : '';
      })
      .filter(Boolean)
      .join('\n\n');
    if (allText) void navigator.clipboard.writeText(allText);
    setContextMenu(null);
  }, [messageIds, messages]);

  // Track measured row heights for the virtual list
  const rowHeightsMap = React.useRef<Map<number, number>>(new Map());

  const getItemSize = useCallback((index: number) => {
    return rowHeightsMap.current.get(index) ?? DEFAULT_ROW_HEIGHT;
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current && turns.length > VIRTUALIZATION_THRESHOLD) {
      listRef.current.scrollToRow({ index: turns.length - 1, align: 'end' });
    }
  }, [turns.length, listRef]);

  const contextMenuElement = (
    <Menu
      open={contextMenu !== null}
      onClose={handleCloseContextMenu}
      anchorReference='anchorPosition'
      anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
    >
      <MenuItem onClick={handleCopy}>
        <ListItemIcon><ContentCopyIcon fontSize='small' /></ListItemIcon>
        <ListItemText>Copy</ListItemText>
      </MenuItem>
      <MenuItem onClick={handleCopyAll}>
        <ListItemIcon><CopyAllIcon fontSize='small' /></ListItemIcon>
        <ListItemText>Copy All</ListItemText>
      </MenuItem>
    </Menu>
  );

  // Use simple rendering for short conversations
  if (turns.length <= VIRTUALIZATION_THRESHOLD) {
    return (
      <SimpleContainer id='messages-container'>
        {turns.map((turn) => (
          <TurnGroup
            key={turn.userMessageId}
            turn={turn}
            isSplitView={isSplitView}
            onDeleteTurn={onDeleteTurn}
            onContextMenu={handleContextMenu}
          />
        ))}
        {children}
        {contextMenuElement}
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
        rowCount={turns.length}
        rowHeight={getItemSize}
        rowProps={{ turns, isSplitView, onDeleteTurn }}
        overscanCount={5}
      />
      {children}
      {contextMenuElement}
    </Container>
  );
};
