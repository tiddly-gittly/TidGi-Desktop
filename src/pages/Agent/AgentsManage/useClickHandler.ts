import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { MouseEvent, useCallback } from 'react';
import { useLocation } from 'wouter';
import type { IAgentListItem } from './AgentsList';

export function useHandleOpenInTheGraphEditor(item?: IAgentListItem) {
  const [, setLocation] = useLocation();
  const handleOpenInTheGraphEditor = useCallback((item1?: IAgentListItem | MouseEvent<HTMLButtonElement>) => {
    const agentID = item?.id ?? (item1 as IAgentListItem)?.id;
    if (!agentID) return;
    // 使用相对路径 - 在嵌套路由上下文中
    setLocation(`/agent/${agentID}/`);
  }, [setLocation, item]);
  return handleOpenInTheGraphEditor;
}

export function useHandleOpenInTheRunAgent(item: IAgentListItem) {
  const [, setLocation] = useLocation();
  const handleOpenInTheGraphEditor = useCallback(() => {
    // 使用相对路径 - 在嵌套路由上下文中
    setLocation(`/session/${item.id}/`);
  }, [setLocation, item]);
  return handleOpenInTheGraphEditor;
}
