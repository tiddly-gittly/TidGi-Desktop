/* eslint-disable unicorn/no-null */
/* eslint-disable @typescript-eslint/promise-function-async */
import { Button, IconButton, List, ListItem, Typography } from '@mui/material';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';
import { ChatListItem } from './ChatListItem';
import { IChatListItem, sortChat, useLoadInitialChats, useWorkspaceIDToStoreNewChats } from './useChatDataSource';
import { useChatsStore } from './useChatsStore';

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
  workspacesList: IWorkspaceWithMetadata[] | undefined;
}

export const ChatsList: React.FC<IChatsListProps> = ({ workflowID, workspacesList }) => {
  const { t } = useTranslation();
  useLoadInitialChats(workspacesList, workflowID);
  const workspaceID = useWorkspaceIDToStoreNewChats(workspacesList);
  const {
    addChat,
    removeChat,
    renameChat,
    chatList,
  } = useChatsStore((state) => ({
    addChat: state.addChat,
    removeChat: state.removeChat,
    renameChat: state.renameChat,
    chatList: Object.values(state.chats).filter((item): item is IChatListItem => item !== undefined).sort((a, b) => sortChat(a, b)),
  }));
  const [activeChatID, setActiveChatID] = useChatsStore((state) => [state.activeChatID, state.setActiveChatID]);
  useEffect(() => {
    if (activeChatID === undefined && chatList.length > 0) {
      setActiveChatID(chatList[0].id);
    }
  }, [chatList, activeChatID, setActiveChatID]);

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
          {chatList.map((chat) => <ChatListItem key={chat.id} workspaceID={workspaceID} chat={chat} onRenameChat={renameChat} onDeleteChat={removeChat} />)}
        </StyledList>
      )}
    </Container>
  );
};
