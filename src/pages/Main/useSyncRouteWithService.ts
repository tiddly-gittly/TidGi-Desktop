import { useEffect } from 'react';
import { useLocation } from 'wouter';

import { usePagesListObservable } from '@services/pages/hooks';
import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';

/**
 * 同步活动页面/工作区状态与前端路由
 * 当页面或工作区变为活动状态时，自动导航到对应的路由
 */
export function useSyncRouteWithService(): void {
  const [location, setLocation] = useLocation();
  const pagesList = usePagesListObservable();
  const workspacesList = useWorkspacesListObservable();

  useEffect(() => {
    if (!pagesList || !workspacesList) return;
    const activePage = pagesList.find(page => page.active);
    const activeWorkspace = workspacesList.find(workspace => workspace.active);
    if (activeWorkspace) {
      const targetRoute = `/${WindowNames.main}/${PageType.wiki}/${activeWorkspace.id}/`;
      if (location !== targetRoute) {
        setLocation(targetRoute);
      }
      return;
    }
    if (activePage) {
      let targetRoute: string;

      switch (activePage.type) {
        case PageType.wiki:
          // Wiki页面应该由上面的工作区逻辑处理
          return;
        case PageType.agent:
          targetRoute = `/${WindowNames.main}/${PageType.agent}/`;
          break;
        case PageType.guide:
          targetRoute = `/${WindowNames.main}/${PageType.guide}/`;
          break;
        case PageType.help:
          targetRoute = `/${WindowNames.main}/${PageType.help}/`;
          break;
        default:
          targetRoute = `/${WindowNames.main}/${PageType.guide}/`;
      }

      if (location !== targetRoute) {
        setLocation(targetRoute);
      }
    }
  }, [pagesList, workspacesList, location, setLocation]);
}
