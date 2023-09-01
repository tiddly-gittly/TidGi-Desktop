/* eslint-disable unicorn/no-null */
/* eslint-disable @typescript-eslint/promise-function-async */
import CheckIcon from '@mui/icons-material/Check';
import ClearIcon from '@mui/icons-material/Clear';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { Button, Fade, IconButton, List, ListItem, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';
import { useHandleOpenInWiki } from '../WorkflowManage/useHandleOpenInWiki';
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

  const menuID = `chat-list-item-menu-${chat.id}`;
  const [menuAnchorElement, setMenuAnchorElement] = useState<null | HTMLElement>(null);
  const handleOpenItemMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setMenuAnchorElement(event.currentTarget);
  }, []);
  const handleCloseItemMenu = useCallback(() => {
    setMenuAnchorElement(null);
  }, []);
  const handleRename = useCallback(() => {
    setMenuAnchorElement(null);
    setIsEditing(true);
  }, []);
  const handleDelete = useCallback(() => {
    setMenuAnchorElement(null);
    onDeleteChat(workspaceID, chat.id);
  }, [onDeleteChat, workspaceID, chat.id]);
  const handleOpenInWiki = useHandleOpenInWiki({ title: chat.id, workspaceID: chat.workspaceID });
  // TODO: run graph in background service or in wiki. instead of useRunGraph on frontend
  const runGraph = useCallback(() => {}, []);
  const stopGraph = useCallback(() => {}, []);

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
              {chat.running === true
                ? (
                  <Tooltip title={t('Workflow.StopWorkflow')}>
                    <ListItemActionButton onClick={stopGraph}>
                      <StopIcon />
                    </ListItemActionButton>
                  </Tooltip>
                )
                : (
                  <Tooltip title={t('Workflow.RunWorkflow')}>
                    <ListItemActionButton onClick={runGraph}>
                      <PlayArrowIcon />
                    </ListItemActionButton>
                  </Tooltip>
                )}
              <ListItemActionButton aria-controls={menuID} aria-haspopup='true' onClick={handleOpenItemMenu}>
                {menuAnchorElement === null ? <MenuIcon /> : <MenuOpenIcon />}
              </ListItemActionButton>
            </ListItemActions>
            <Menu
              id={menuID}
              anchorEl={menuAnchorElement}
              keepMounted
              open={menuAnchorElement !== null}
              onClose={handleCloseItemMenu}
              TransitionComponent={Fade}
            >
              <MenuItem onClick={handleDelete}>
                <DeleteIcon />
                {t('Workflow.DeleteChat')}
              </MenuItem>
              <MenuItem
                onClick={handleRename}
              >
                <EditIcon />
                {t('Workflow.RenameChat')}
              </MenuItem>
              <MenuItem onClick={handleOpenInWiki}>
                {t('Workflow.OpenInWorkspaceTiddler', { title: chat.title, workspace: chat.metadata?.workspace?.name ?? t('AddWorkspace.MainWorkspace') })}
              </MenuItem>
            </Menu>
          </>
        )}
    </StyledListItem>
  );
};
