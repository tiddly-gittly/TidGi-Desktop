import { Helmet } from '@dr.pogodin/react-helmet';
import { styled, Theme } from '@mui/material/styles';
import { lazy } from 'react';
import { useTranslation } from 'react-i18next';
import is, { isNot } from 'typescript-styled-is';
import { Route, Switch } from 'wouter';

import { PageType } from '@/constants/pageTypes';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import FindInPage from './FindInPage';
import { SideBar } from './Sidebar';
import { useInitialPage } from './useInitialPage';

const Agent = lazy(() => import('../Agent'));
const Guide = lazy(() => import('../Guide'));
const Help = lazy(() => import('../Help'));
const WikiBackground = lazy(() => import('../WikiBackground'));

const OuterRoot = styled('div')`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
`;

const Root = styled('div')`
  display: flex;
  flex-direction: row;
  flex: 1;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: ${({ theme }) => theme.palette.background.default};
  color: ${({ theme }) => theme.palette.text.primary};

  .simplebar-content {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
`;

const ContentRoot = styled('div')<{ $sidebar: boolean }>`
  flex: 1;
  display: flex;
  flex-direction: column;

  ${is('$sidebar')`
    width: calc(100% - ${({ theme }: { theme: Theme }) => theme.sidebar.width}px);
    max-width: calc(100% - ${({ theme }: { theme: Theme }) => theme.sidebar.width}px);
  `}
  ${isNot('$sidebar')`
    width: 100%;
  `}
  height: 100%;
`;

const windowName = window.meta().windowName;

export default function Main(): React.JSX.Element {
  const { t } = useTranslation();
  useInitialPage();
  const preferences = usePreferenceObservable();
  const showSidebar = (windowName === WindowNames.menuBar ? preferences?.sidebarOnMenubar : preferences?.sidebar) ?? true;
  return (
    <OuterRoot>
      <Helmet>
        <title>{t('Menu.TidGi')}</title>
      </Helmet>
      <Root>
        {showSidebar && <SideBar />}
        <ContentRoot $sidebar={showSidebar}>
          <FindInPage />
          <Switch>
            <Route path={`/${PageType.wiki}/:id/`} component={WikiBackground} />
            <Route path={`/${PageType.agent}`} component={Agent} />
            <Route path={`/${PageType.guide}`} component={Guide} />
            <Route path={`/${PageType.help}`} component={Help} />
            <Route path='/' component={Guide} />
            <Route component={Guide} />
          </Switch>
        </ContentRoot>
      </Root>
    </OuterRoot>
  );
}
