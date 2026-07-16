import { TabListDropdown } from '@/pages/Agent/components/TabBar/TabListDropdown';
import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore';
import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';

import ChatTitle from './ChatTitle';

const Header = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
`;

interface ChatHeaderProps {
  title?: string;
  isSplitView?: boolean;
}

/**
 * Minimal chat header that only shows content visible from both the
 * conversation list and the current conversation (tab switcher + title).
 */
export const ChatHeader: React.FC<ChatHeaderProps> = ({ title, isSplitView }) => {
  const { agent, updateAgent } = useAgentChatStore(
    useShallow((state) => ({ agent: state.agent, updateAgent: state.updateAgent })),
  );

  return (
    <Header>
      {!isSplitView && <TabListDropdown />}
      <ChatTitle title={title} agent={agent} updateAgent={updateAgent} />
    </Header>
  );
};
