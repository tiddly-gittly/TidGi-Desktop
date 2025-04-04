/* eslint-disable unicorn/no-null */
/* eslint-disable @typescript-eslint/promise-function-async */
import { Button, List } from '@mui/material';
import { IChatListItem } from '@services/workflow/interface';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';
import { ChatListItem } from './ChatListItem';
import { useChatsStore } from './useChatsStore';

export function sortChat(a: IChatListItem, b: IChatListItem) {
  // @ts-expect-error The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.ts(2362)
  return b.metadata.tiddler.created - a.metadata.tiddler.created;
}

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: ${({ theme }) => theme.workflow.run.chatsList.width}px;
  height: 100%;
`;

const AddChatButton = styled(Button)`
  margin: 10px 0;
`;

const StyledList = styled(List)`
  width: 100%;
  height: 100%;
  overflow-y: auto;
  &::-webkit-scrollbar {
    width: 0;
  }
`;

interface IChatsListProps {
  workflowID: string | undefined;
  /**
   * workspaceID containing the graphTiddler (its title is also the workflowID).
   */
  workspaceID: string | undefined;
}

export const ChatsList: React.FC<IChatsListProps> = ({ workflowID, workspaceID }) => {
  const { t } = useTranslation();

  const [addChat, activeChatID, setActiveChatID, chatIDs] = useChatsStore((state) => [state.addChat, state.activeChatID, state.setActiveChatID, state.chatIDs]);
  useEffect(() => {
    if (activeChatID === undefined && chatIDs.length > 0) {
      setActiveChatID(chatIDs[0]);
    }
  }, [chatIDs, activeChatID, setActiveChatID]);

  return (
    <Container>
      <AddChatButton
        variant='contained'
        color='primary'
        onClick={async () => {
          if (workspaceID === undefined || workflowID === undefined) return;
          await addChat({ workflowID, workspaceID });
        }}
      >
        {t('Workflow.NewChat')}
      </AddChatButton>
      {workspaceID !== undefined && (
        <StyledList>
          {chatIDs.map((chatID) => <ChatListItem key={chatID} workspaceID={workspaceID} chat={chat} onRenameChat={renameChat} onDeleteChat={removeChat} />)}
        </StyledList>
      )}
    </Container>
  );
};
