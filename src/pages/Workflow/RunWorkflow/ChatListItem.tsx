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
import { Button, Fade, IconButton, ListItem, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';
import type { IChatListItem } from '../../../services/workflow/networkFromWiki';
import { useHandleOpenInWiki } from '../WorkflowManage/useHandleOpenInWiki';

const RenameInput = styled.input`
  margin-right: 0.5em;
  padding: 0.5em;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.palette.grey[400]};
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

interface IChatListItemProps {
  chat: IChatListItem;
  onDeleteChat: (removeChat: string, chatID: string) => void;
  onRenameChat: (chatID: string, newTitle: string) => void;
  workspaceID: string;
}

export const ChatListItem: React.FC<IChatListItemProps> = ({ chat, onRenameChat, onDeleteChat, workspaceID }) => {
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
