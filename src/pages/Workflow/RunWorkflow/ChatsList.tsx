/* eslint-disable @typescript-eslint/promise-function-async */
import DeleteIcon from '@mui/icons-material/Delete';
import { Button, IconButton, List, ListItem, Tooltip, Typography } from '@mui/material';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';
import { useChatDataSource } from './useChatDataSource';
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

const StyledListItem = styled(ListItem)`
  display: flex;
  justify-content: space-between;
  align-items: center;
  `;
const OpenListItemButton = styled(Button)`
    margin: 10px 0;
  `;
const ListItemTitle = styled(Typography)`
  margin-right: 0.5em;
`;

interface IChatsListProps {
  workflowID: string | undefined;
  workspacesList: IWorkspaceWithMetadata[] | undefined;
}

export const ChatsList: React.FC<IChatsListProps> = ({ workflowID, workspacesList }) => {
  const { t } = useTranslation();
  const [chatList, onAddChat, onDeleteChat] = useChatDataSource(workspacesList, workflowID);
  const [activeChatID, setActiveChatID] = useChatsStore((state) => [state.activeChatID, state.setActiveChatID]);
  useEffect(() => {
    if (activeChatID === undefined && chatList.length > 0) {
      setActiveChatID(chatList[0].id);
    }
  }, [chatList, activeChatID, setActiveChatID]);

  return (
    <Container>
      <AddChatButton variant='contained' color='primary' onClick={() => onAddChat()}>
        {t('Workflow.NewChat')}
      </AddChatButton>
      <List>
        {chatList.map((chat) => (
          <StyledListItem key={chat.id}>
            <OpenListItemButton>
              <ListItemTitle>{chat.title}</ListItemTitle>
            </OpenListItemButton>
            <Tooltip title={t('Workflow.DeleteChat')}>
              <IconButton
                onClick={() => {
                  onDeleteChat(chat.id);
                }}
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </StyledListItem>
        ))}
      </List>
    </Container>
  );
};
