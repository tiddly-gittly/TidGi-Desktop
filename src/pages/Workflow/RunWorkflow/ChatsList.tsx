/* eslint-disable @typescript-eslint/promise-function-async */
import { Button, List, ListItem } from '@mui/material';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';
import { useChatDataSource } from './useChatDataSource';

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const AddChatButton = styled(Button)`
  margin: 10px 0;
`;

const StyledListItem = styled(ListItem)`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

interface IChatsListProps {
  workflowID: string | undefined;
  workspacesList: IWorkspaceWithMetadata[] | undefined;
}

export const ChatsList: React.FC<IChatsListProps> = ({ workflowID, workspacesList }) => {
  const { t } = useTranslation();
  const [chatList, onAddChat, onDeleteChat] = useChatDataSource(workspacesList, workflowID);

  return (
    <Container>
      <AddChatButton variant='contained' color='primary' onClick={() => onAddChat()}>
        {t('Workflow.NewChat')}
      </AddChatButton>
      <List>
        {chatList.map((chat) => (
          <StyledListItem key={chat.id}>
            {chat.title}
            <Button
              onClick={() => {
                onDeleteChat(chat.id);
              }}
            >
              {t('Workflow.DeleteChat')}
            </Button>
          </StyledListItem>
        ))}
      </List>
    </Container>
  );
};
