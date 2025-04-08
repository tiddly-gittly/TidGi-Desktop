/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { WikiChannel } from '@/constants/channels';
import { PageType } from '@services/pages/interface';
import { useCallback } from 'react';
import { useLocation } from 'wouter';

export function useHandleOpenInWiki(item: { title: string; workspaceID: string }) {
  const [, setLocation] = useLocation();

  const handleOpenInWiki = useCallback(async () => {
    if (!item.workspaceID) return;
    const oldActivePage = await window.service.pages.getActivePage();
    await window.service.pages.setActivePage(PageType.wiki);
    await window.service.workspaceView.setActiveWorkspaceView(item.workspaceID);
    
    // 使用绝对路径跳到 wiki 页面，因为这是从 agent 页面跳转
    setLocation(`~/${PageType.wiki}/${item.workspaceID}/`);
    await window.service.wiki.wikiOperationInBrowser(WikiChannel.openTiddler, item.workspaceID, [item.title]);
  }, [item, setLocation]);
  return handleOpenInWiki;
}
