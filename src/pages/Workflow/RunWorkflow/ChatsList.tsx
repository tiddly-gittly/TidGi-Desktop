/* eslint-disable @typescript-eslint/promise-function-async */
import CheckIcon from '@mui/icons-material/Check';
import ClearIcon from '@mui/icons-material/Clear';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { Button, IconButton, List, ListItem, Tooltip, Typography } from '@mui/material';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';
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
const StyledListItem = styled(ListItem)`
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 3em;
  width: 100%;
  padding-left: 0;
  padding-right: 0;
`;
const OpenListItemButton = styled(Button)`
`;
const ListItemTitle = styled(Typography)`
  margin-right: 0.5em;
`;
const ListItemActions = styled.div`
  display: flex;
  align-items: center;
`;
const ListItemActionButton = styled(IconButton)`
  width: 24px;
  height: 24px;
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

const RenameInput = styled.input`
  margin-right: 0.5em;
  padding: 0.5em;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.palette.grey[400]};
`;

interface IChatListItemProps {
  chat: IChatListItem;
  onDeleteChat: (removeChat: string, chatID: string) => void;
  onRenameChat: (chatID: string, newTitle: string) => void;
  workspaceID: string;
}

const ChatListItem: React.FC<IChatListItemProps> = ({ chat, onRenameChat, onDeleteChat, workspaceID }) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [temporaryTitle, setTemporaryTitle] = useState<string>(chat.title);

  return (
    <StyledListItem>
      {isEditing
        ? (
          <>
            <RenameInput
              value={temporaryTitle}
              onChange={(event) => {
                setTemporaryTitle(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onRenameChat(chat.id, temporaryTitle);
                  setIsEditing(false);
                }
              }}
            />
            <ListItemActions>
              <ListItemActionButton
                onClick={() => {
                  onRenameChat(chat.id, temporaryTitle);
                  setIsEditing(false);
                }}
              >
                <CheckIcon />
              </ListItemActionButton>
              <ListItemActionButton
                onClick={() => {
                  setTemporaryTitle(chat.title);
                  setIsEditing(false);
                }}
              >
                <ClearIcon />
              </ListItemActionButton>
            </ListItemActions>
          </>
        )
        : (
          <>
            <OpenListItemButton fullWidth>
              <ListItemTitle>{chat.title}</ListItemTitle>
            </OpenListItemButton>
            <ListItemActions>
              <Tooltip title={t('Workflow.RenameChat')}>
                <ListItemActionButton
                  onClick={() => {
                    setIsEditing(true);
                  }}
                >
                  <EditIcon />
                </ListItemActionButton>
              </Tooltip>
              <Tooltip title={t('Workflow.DeleteChat')}>
                <ListItemActionButton
                  onClick={() => {
                    onDeleteChat(workspaceID, chat.id);
                  }}
                >
                  <DeleteIcon />
                </ListItemActionButton>
              </Tooltip>
            </ListItemActions>
          </>
        )}
    </StyledListItem>
  );
};
