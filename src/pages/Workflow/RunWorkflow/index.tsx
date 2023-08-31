import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import React from 'react';
import { styled } from 'styled-components';
import { useRoute } from 'wouter';
import { ChatArea, EmptyChatArea } from './ChatArea';
import { ChatsList } from './ChatsList';
import { runRouteName } from './constants';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

export const RunWorkflow: React.FC = () => {
  const [match, parameters] = useRoute(`/${WindowNames.main}/${PageType.workflow}/${runRouteName}/:workflowID/:runID*/`);
  /**
   * This will be the active chat ID if the URL matches, otherwise it'll be undefined.
   */
  const activeRunID = parameters?.runID;
  const workflowID = parameters?.workflowID;
  const workspacesList = useWorkspacesListObservable();

  return (
    <Container>
      <ChatsList workflowID={workflowID} workspacesList={workspacesList} />
      {activeRunID === undefined ? <EmptyChatArea /> : <ChatArea chatID={activeRunID} />}
    </Container>
  );
};
