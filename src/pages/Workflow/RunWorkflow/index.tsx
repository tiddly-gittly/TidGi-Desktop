import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import React from 'react';
import { styled } from 'styled-components';
import { ChatArea, EmptyChatArea } from './ChatArea';
import { ChatsList } from './ChatsList';
import { useSyncStoreWithUrl } from './useSyncStoreWithUrl';

const Container = styled.div`
  display: flex;
  flex-direction: row;
  gap: 1rem;
  height: 100%;
`;

export const RunWorkflow: React.FC = () => {
  const {
    activeChatID,
    workflowID,
  } = useSyncStoreWithUrl();
  const workspacesList = useWorkspacesListObservable();

  return (
    <Container>
      <ChatsList workflowID={workflowID} workspacesList={workspacesList} />
      {activeChatID === undefined ? <EmptyChatArea /> : <ChatArea chatID={activeChatID} />}
    </Container>
  );
};
